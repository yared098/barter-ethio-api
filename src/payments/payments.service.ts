import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChapaService } from './chapa.service';
import { InitPaymentDto } from './dto/init-payment.dto';
import { PLANS } from './plans';
import { endOfTodayUtc } from '../common/helpers/posting-limits';

@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chapa: ChapaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─────────────────────────────────────────────────────────
  // INIT — create payment row + get Chapa checkout URL
  // ─────────────────────────────────────────────────────────
  async init(userId: string, dto: InitPaymentDto) {
    const plan = PLANS[dto.plan];
    if (!plan) throw new BadRequestException('Unknown plan');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const txRef = `BARTER-${Date.now()}-${randomBytes(4).toString('hex')}`;

    // ── persist grant info BEFORE calling Chapa (so webhook can trust it)
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        txRef,
        amount: plan.price,
        currency: 'ETB',
        plan: dto.plan,

        // grants — derived from PLANS config
        grantsCredits: plan.periodDays === null ? plan.periodLimit : null, // credit packs
        grantsProPosts:
          plan.periodDays !== null && plan.periodLimit !== plan.dailyCap
            ? plan.periodLimit
            : null, // monthly_pro / yearly_pro
        grantsProDays:
          plan.periodDays !== null && plan.periodLimit !== plan.dailyCap
            ? plan.periodDays
            : null,
        grantsDailyPass:
          plan.periodDays === 1 && plan.periodLimit === plan.dailyCap,

        status: 'pending',
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });

    // ── call Chapa
    const { checkoutUrl } = await this.chapa.initialize({
      amount: plan.price,
      currency: 'ETB',
      email: user.email ?? 'noreply@barter.local',
      firstName: user.name?.split(' ')[0] ?? 'Customer',
      lastName: user.name?.split(' ').slice(1).join(' ') || 'Barter',
      txRef,
      callbackUrl: `${this.config.get('API_PUBLIC_URL')}/payments/webhook`,
      returnUrl: this.config.get('APP_DEEP_LINK')!,
      title: 'Barter',
      description: plan.label ?? dto.plan,
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { checkoutUrl },
    });

    return {
      paymentId: payment.id,
      txRef,
      checkoutUrl,
      amount: plan.price,
      currency: 'ETB',
      planLabel: plan.label ?? dto.plan,
      expiresAt: payment.expiresAt,
    };
  }

    // ─────────────────────────────────────────────────────────
  // PUBLIC STATUS BY TXREF — used by the netlify success page
  //   Only reveals safe fields (no userId, no rawResponse)
  // ─────────────────────────────────────────────────────────
  async getByTxRef(txRef: string) {
    let p = await this.prisma.payment.findUnique({ where: { txRef } });
    if (!p) throw new NotFoundException('Payment not found');

    // If still pending, ask Chapa directly (webhook may be delayed)
    if (p.status === 'pending') {
      const v = await this.chapa.verify(txRef);
      if (v?.status === 'success') {
        await this.markPaid(txRef, v);
      } else if (v?.status === 'failed') {
        await this.prisma.payment.update({
          where: { id: p.id },
          data: { status: 'failed', rawResponse: v },
        });
      } else if (p.expiresAt < new Date()) {
        await this.prisma.payment.update({
          where: { id: p.id },
          data: { status: 'expired' },
        });
      }
      p = await this.prisma.payment.findUnique({ where: { txRef } });
    }

    return {
      txRef: p!.txRef,
      status: p!.status,          // pending | paid | failed | expired
      amount: p!.amount,
      currency: p!.currency,
      plan: p!.plan,
      paidAt: p!.paidAt,
      expiresAt: p!.expiresAt,
    };
  }
  // ─────────────────────────────────────────────────────────
  // STATUS — polled by the app every 3s
  // ─────────────────────────────────────────────────────────
  async getStatus(userId: string, paymentId: string) {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!p || p.userId !== userId) throw new NotFoundException('Not found');

    // Still pending? Verify against Chapa directly (fallback if webhook delayed)
    if (p.status === 'pending') {
      const v = await this.chapa.verify(p.txRef);
      if (v?.status === 'success') {
        await this.markPaid(p.txRef, v);
      } else if (v?.status === 'failed') {
        await this.prisma.payment.update({
          where: { id: p.id },
          data: { status: 'failed', rawResponse: v },
        });
      }
    }

    // Auto-expire if TTL passed
    const fresh = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (fresh!.status === 'pending' && fresh!.expiresAt < new Date()) {
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'expired' },
      });
    }

    const final = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    return {
      paymentId: final!.id,
      txRef: final!.txRef,
      status: final!.status,
      amount: final!.amount,
      currency: final!.currency,
      checkoutUrl: final!.checkoutUrl,
      expiresAt: final!.expiresAt,
      paidAt: final!.paidAt,
    };
  }

  // ─────────────────────────────────────────────────────────
  // WEBHOOK — called by Chapa (never trust the body)
  // ─────────────────────────────────────────────────────────
  async handleWebhook(body: any) {
    const txRef: string | undefined =
      body?.tx_ref ?? body?.txRef ?? body?.reference;

    if (!txRef) {
      this.log.warn('Webhook missing tx_ref');
      return { ok: false };
    }

    // Always verify against Chapa — never trust the webhook payload
    const v = await this.chapa.verify(txRef);
    if (!v) {
      this.log.warn(`verify failed for webhook ${txRef}`);
      return { ok: false };
    }

    if (v.status === 'success') {
      await this.markPaid(txRef, v);
    } else if (v.status === 'failed') {
      await this.prisma.payment.updateMany({
        where: { txRef, status: 'pending' },
        data: { status: 'failed', rawResponse: v },
      });
    }
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────
  // MARK PAID — grant credits/plan (idempotent)
  // ─────────────────────────────────────────────────────────
  private async markPaid(txRef: string, verified: any) {
    const p = await this.prisma.payment.findUnique({ where: { txRef } });
    if (!p || p.status === 'paid') return; // idempotent

    const paid = parseFloat(verified.amount ?? '0');
    if (paid < p.amount - 0.01) {
      this.log.warn(
        `amount mismatch ${txRef}: paid=${paid} expected=${p.amount}`,
      );
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: p.userId },
    });
    if (!user) return;

    const now = new Date();
    const updates: any = {};

    if (p.grantsDailyPass) {
      // Daily pass — 10/day until midnight UTC
      updates.dailyPassExpiresAt = endOfTodayUtc();
      if (user.tier === 'FREE') updates.tier = 'DAILY';
    } else if (p.grantsProPosts && p.grantsProDays) {
      // Monthly / yearly PRO — stack budget + extend expiry
      const base =
        user.proExpiresAt && user.proExpiresAt > now
          ? user.proExpiresAt
          : now;
      const newEnd = new Date(base);
      newEnd.setDate(newEnd.getDate() + p.grantsProDays);

      updates.proExpiresAt = newEnd;
      updates.proBudgetRemaining =
        (user.proBudgetRemaining ?? 0) + p.grantsProPosts;
      updates.tier = 'PRO';
    } else if (p.grantsCredits) {
      // Credit pack — never expires
      updates.creditsRemaining =
        (user.creditsRemaining ?? 0) + p.grantsCredits;
      // don't downgrade an active PRO/DAILY
      if (user.tier === 'FREE') updates.tier = 'CREDIT';
    }

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { txRef },
        data: { status: 'paid', paidAt: now, rawResponse: verified },
      }),
      this.prisma.user.update({
        where: { id: p.userId },
        data: updates,
      }),
    ]);

    this.log.log(`PAID ${txRef} plan=${p.plan} user=${p.userId}`);

    // optional push
    try {
      await this.notifications.sendToUser(p.userId, {
        title: 'Payment confirmed 🎉',
        body: 'Your Barter posts are ready to use.',
      });
    } catch (e) {
      this.log.warn(`push failed: ${(e as Error).message}`);
    }
  }

  getPlans() {
    return Object.values(PLANS).map((p) => ({
      id: p.id,
      label: p.label,
      price: p.price,
      currency: p.currency,
      description: p.description,
      tier: p.tier,
      badgeKey: p.badgeKey ?? null,       // ← was `badge`
      highlighted: p.highlighted ?? false,
      dailyCap: p.dailyCap,
      periodLimit: p.periodLimit,
      periodDays: p.periodDays,
    }));
  }
}