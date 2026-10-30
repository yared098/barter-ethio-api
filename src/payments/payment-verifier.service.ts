import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ChapaService } from './chapa.service';
import { NotificationsService } from '../notifications/notifications.service';
import { endOfTodayUtc } from '../common/helpers/posting-limits';

@Injectable()
export class PaymentVerifierService {
  private readonly log = new Logger(PaymentVerifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chapa: ChapaService,
    private readonly notifications: NotificationsService,
  ) {}

  // Runs every 30 seconds
  @Cron(CronExpression.EVERY_30_SECONDS)
  async autoVerifyPendingPayments() {
    const pending = await this.prisma.payment.findMany({
      where: {
        status: 'pending',
        expiresAt: { gt: new Date() }, // not expired
      },
      take: 20, // limit to avoid too many API calls
    });

    if (pending.length === 0) return;

    this.log.log(`🔍 Auto-verifying ${pending.length} pending payments...`);

    for (const payment of pending) {
      try {
        const v = await this.chapa.verify(payment.txRef);
        if (!v) continue;

        if (v.status === 'success') {
          await this.markPaid(payment.txRef, v);
          this.log.log(`✅ Auto-verified payment ${payment.txRef}`);
        } else if (v.status === 'failed') {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'failed', rawResponse: v as any },
          });
          this.log.warn(`❌ Payment ${payment.txRef} failed (auto-verify)`);
        }
      } catch (err) {
        this.log.error(`Auto-verify error for ${payment.txRef}: ${(err as Error).message}`);
      }
    }
  }

  // Mark as paid (same logic as PaymentsService.markPaid)
  private async markPaid(txRef: string, verified: any) {
    const p = await this.prisma.payment.findUnique({ where: { txRef } });
    if (!p || p.status === 'paid') return;

    const paid = parseFloat(String(verified.amount ?? '0'));
    if (paid < p.amount - 0.01) {
      this.log.warn(`markPaid: amount mismatch ${txRef}`);
      return;
    }

    const user = await this.prisma.user.findUnique({ where: { id: p.userId } });
    if (!user) return;

    const now = new Date();
    const updates: any = {};

    if (p.grantsDailyPass) {
      updates.dailyPassExpiresAt = endOfTodayUtc();
      if (user.tier === 'FREE') updates.tier = 'DAILY';
    } else if (p.grantsProPosts && p.grantsProDays) {
      const base = user.proExpiresAt && user.proExpiresAt > now ? user.proExpiresAt : now;
      const newEnd = new Date(base);
      newEnd.setDate(newEnd.getDate() + p.grantsProDays);
      updates.proExpiresAt = newEnd;
      updates.proBudgetRemaining = (user.proBudgetRemaining ?? 0) + p.grantsProPosts;
      updates.tier = 'PRO';
    } else if (p.grantsCredits) {
      updates.creditsRemaining = (user.creditsRemaining ?? 0) + p.grantsCredits;
      if (user.tier === 'FREE') updates.tier = 'CREDIT';
    }

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { txRef },
        data: { status: 'paid', paidAt: now, rawResponse: verified as any },
      }),
      this.prisma.user.update({
        where: { id: p.userId },
        data: updates,
      }),
    ]);

    try {
      await this.notifications.sendToUser(p.userId, {
        title: 'Payment confirmed 🎉',
        body: 'Your Barter posts are ready to use.',
      });
    } catch (e) {
      this.log.warn(`push failed: ${(e as Error).message}`);
    }
  }
}