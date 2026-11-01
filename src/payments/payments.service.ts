// import {
//   BadRequestException,
//   Injectable,
//   Logger,
//   NotFoundException,
// } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { randomBytes } from 'crypto';
// import { PrismaService } from '../prisma/prisma.service';
// import { NotificationsService } from '../notifications/notifications.service';
// import { ChapaService } from './chapa.service';
// import { InitPaymentDto } from './dto/init-payment.dto';
// import { PLANS } from './plans';
// import { endOfTodayUtc } from '../common/helpers/posting-limits';
// import { RedisService } from '../redis/redis.service';

// @Injectable()
// export class PaymentsService {
//   private readonly log = new Logger(PaymentsService.name);

//   constructor(
//     private readonly prisma: PrismaService,
//     private readonly chapa: ChapaService,
//     private readonly config: ConfigService,
//     private readonly notifications: NotificationsService,
//     private readonly redis: RedisService,  
//   ) {}

//   // ─────────────────────────────────────────────────────────
//   // INIT — create payment row + get Chapa checkout URL
//   // ─────────────────────────────────────────────────────────
//   async init(userId: string, dto: InitPaymentDto) {
//     const plan = PLANS[dto.plan];
//     if (!plan) throw new BadRequestException('Unknown plan');

//     const user = await this.prisma.user.findUnique({ where: { id: userId } });
//     if (!user) throw new NotFoundException('User not found');

//     const txRef = `BARTER-${Date.now()}-${randomBytes(4).toString('hex')}`;

//     // ── persist grant info BEFORE calling Chapa (so webhook can trust it)
//     const payment = await this.prisma.payment.create({
//       data: {
//         userId,
//         txRef,
//         amount: plan.price,
//         currency: 'ETB',
//         plan: dto.plan,

//         // grants — derived from PLANS config
//         grantsCredits: plan.periodDays === null ? plan.periodLimit : null,
//         grantsProPosts:
//           plan.periodDays !== null && plan.periodLimit !== plan.dailyCap
//             ? plan.periodLimit
//             : null,
//         grantsProDays:
//           plan.periodDays !== null && plan.periodLimit !== plan.dailyCap
//             ? plan.periodDays
//             : null,
//         grantsDailyPass:
//           plan.periodDays === 1 && plan.periodLimit === plan.dailyCap,

//         status: 'pending',
//         expiresAt: new Date(Date.now() + 15 * 60_000),
//       },
//     });

//     // ── FIX #1: append ?tx_ref= to returnUrl so netlify page can find it
//     const deepLink = this.config.get('APP_DEEP_LINK')!;
//     const returnUrl = `${deepLink}${deepLink.includes('?') ? '&' : '?'}tx_ref=${encodeURIComponent(txRef)}`;
//     this.log.log(`[init] returnUrl = ${returnUrl}`);

//     // ── call Chapa
//     const { checkoutUrl } = await this.chapa.initialize({
//       amount: plan.price,
//       currency: 'ETB',
//       email: user.email ?? 'noreply@barter.local',
//       firstName: user.name?.split(' ')[0] ?? 'Customer',
//       lastName: user.name?.split(' ').slice(1).join(' ') || 'Barter',
//       txRef,
//       callbackUrl: `${this.config.get('API_PUBLIC_URL')}/payments/webhook`,
//       returnUrl,                      // ← now includes tx_ref
//       title: 'Barter',
//       description: plan.label ?? dto.plan,
//     });

//     await this.prisma.payment.update({
//       where: { id: payment.id },
//       data: { checkoutUrl },
//     });

//     return {
//       paymentId: payment.id,
//       txRef,
//       checkoutUrl,
//       amount: plan.price,
//       currency: 'ETB',
//       planLabel: plan.label ?? dto.plan,
//       expiresAt: payment.expiresAt,
//     };
//   }

//   // ─────────────────────────────────────────────────────────
//   // PUBLIC STATUS BY TXREF — used by the netlify success page
//   // ─────────────────────────────────────────────────────────
//   async getByTxRef(txRef: string) {
//     let p = await this.prisma.payment.findUnique({ where: { txRef } });
//     if (!p) throw new NotFoundException('Payment not found');

//     if (p.status === 'pending') {
//       const v = await this.chapa.verify(txRef);
//       if (v?.status === 'success') {
//         await this.markPaid(txRef, v);
//       } else if (v?.status === 'failed') {
//         await this.prisma.payment.update({
//           where: { id: p.id },
//           data: { status: 'failed', rawResponse: v as any },
//         });
//       } else if (p.expiresAt < new Date()) {
//         await this.prisma.payment.update({
//           where: { id: p.id },
//           data: { status: 'expired' },
//         });
//       }
//       p = await this.prisma.payment.findUnique({ where: { txRef } });
//     }

//     return {
//       txRef: p!.txRef,
//       status: p!.status,
//       amount: p!.amount,
//       currency: p!.currency,
//       plan: p!.plan,
//       paidAt: p!.paidAt,
//       expiresAt: p!.expiresAt,
//     };
//   }

//   // ─────────────────────────────────────────────────────────
//   // STATUS — polled by the app every 3s
//   // ─────────────────────────────────────────────────────────
//   async getStatus(userId: string, paymentId: string) {
//     const p = await this.prisma.payment.findUnique({
//       where: { id: paymentId },
//     });
//     if (!p || p.userId !== userId) throw new NotFoundException('Not found');

//     if (p.status === 'pending') {
//       const v = await this.chapa.verify(p.txRef);
//       if (v?.status === 'success') {
//         await this.markPaid(p.txRef, v);
//       } else if (v?.status === 'failed') {
//         await this.prisma.payment.update({
//           where: { id: p.id },
//           data: { status: 'failed', rawResponse: v as any },
//         });
//       }
//     }

//     const fresh = await this.prisma.payment.findUnique({
//       where: { id: paymentId },
//     });
//     if (fresh!.status === 'pending' && fresh!.expiresAt < new Date()) {
//       await this.prisma.payment.update({
//         where: { id: paymentId },
//         data: { status: 'expired' },
//       });
//     }

//     const final = await this.prisma.payment.findUnique({
//       where: { id: paymentId },
//     });
//     return {
//       paymentId: final!.id,
//       txRef: final!.txRef,
//       status: final!.status,
//       amount: final!.amount,
//       currency: final!.currency,
//       checkoutUrl: final!.checkoutUrl,
//       expiresAt: final!.expiresAt,
//       paidAt: final!.paidAt,
//     };
//   }

//   // ─────────────────────────────────────────────────────────
//   // WEBHOOK — FIX #2: check body.data.tx_ref + log everything
//   // ─────────────────────────────────────────────────────────
// async handleWebhook(body: any) {
//   this.log.log(`← Webhook received: ${JSON.stringify(body)}`);

//   // chapa.verify(txRef) below IS the security check —
//   // we query Chapa's API with our secret key, so a spoofed body
//   // can't fake a "success" response. Signature check not needed.

//   const candidates: any[] = [
//     body?.payload,
//     body?.data,
//     body?.event_data,
//     body?.transaction,
//     body,
//   ].filter(Boolean);

//   let txRef: string | undefined;
//   for (const c of candidates) {
//     txRef =
//       c?.tx_ref ??
//       c?.trx_ref ??
//       c?.txRef ??
//       (typeof c?.reference === 'string' && c.reference.startsWith('BARTER-')
//         ? c.reference
//         : undefined);
//     if (txRef) break;
//   }

//   if (!txRef) {
//     this.log.warn(
//       `✗ Webhook missing tx_ref.` +
//         ` Top-level keys: [${Object.keys(body ?? {}).join(',')}]` +
//         ` | payload keys: [${Object.keys(body?.payload ?? {}).join(',')}]`,
//     );
//     return { ok: false };
//   }

//   this.log.log(`→ Webhook processing: ${txRef}`);

//   const v = await this.chapa.verify(txRef);
//   if (!v) {
//     this.log.warn(`✗ Chapa verify returned null for ${txRef}`);
//     return { ok: false };
//   }

//   this.log.log(
//     `✓ Chapa verify: ${txRef} status=${v.status} amount=${v.amount}`,
//   );

//   if (v.status === 'success') {
//     await this.markPaid(txRef, v);
//   } else if (v.status === 'failed') {
//     await this.prisma.payment.updateMany({
//       where: { txRef, status: 'pending' },
//       data: { status: 'failed', rawResponse: v as any },
//     });
//   }
//   return { ok: true };
// }
//   // ─────────────────────────────────────────────────────────
//   // MARK PAID — grant credits/plan (idempotent)
//   // ─────────────────────────────────────────────────────────
//  private async markPaid(txRef: string, verified: any) {
//   const p = await this.prisma.payment.findUnique({ where: { txRef } });
//   if (!p) {
//     this.log.warn(`markPaid: ${txRef} not found`);
//     return;
//   }

//   // Idempotency — already paid, skip
//   if (p.status === 'paid') {
//     this.log.log(`markPaid: ${txRef} already paid — skipping`);
//     return;
//   }

//   const paid = parseFloat(String(verified.amount ?? '0'));
//   this.log.log(
//     `markPaid ${txRef}: paid=${paid} expected=${p.amount} ` +
//       `grants={credits:${p.grantsCredits}, proPosts:${p.grantsProPosts}, ` +
//       `proDays:${p.grantsProDays}, dailyPass:${p.grantsDailyPass}}`,
//   );

//   if (paid < p.amount - 0.01) {
//     this.log.warn(`markPaid: amount mismatch ${txRef} — SKIPPING`);
//     return;
//   }

//   const user = await this.prisma.user.findUnique({
//     where: { id: p.userId },
//   });
//   if (!user) {
//     this.log.warn(`markPaid: user ${p.userId} not found`);
//     return;
//   }

//   const now = new Date();
//   const updates: any = {};

//   if (p.grantsDailyPass) {
//     updates.dailyPassExpiresAt = endOfTodayUtc();
//     if (user.tier === 'FREE') updates.tier = 'DAILY';
//   } else if (p.grantsProPosts && p.grantsProDays) {
//     const base =
//       user.proExpiresAt && user.proExpiresAt > now
//         ? user.proExpiresAt
//         : now;
//     const newEnd = new Date(base);
//     newEnd.setDate(newEnd.getDate() + p.grantsProDays);
//     updates.proExpiresAt = newEnd;
//     updates.proBudgetRemaining =
//       (user.proBudgetRemaining ?? 0) + p.grantsProPosts;
//     updates.tier = 'PRO';
//   } else if (p.grantsCredits) {
//     updates.creditsRemaining =
//       (user.creditsRemaining ?? 0) + p.grantsCredits;
//     if (user.tier === 'FREE') updates.tier = 'CREDIT';
//   }

//   if (Object.keys(updates).length === 0) {
//     this.log.warn(`markPaid: empty updates for ${txRef} — no grants set`);
//     await this.prisma.payment.update({
//       where: { txRef },
//       data: { status: 'paid', paidAt: now, rawResponse: verified as any },
//     });
//     return;
//   }

//   // ═══════════════════════════════════════════════════════════
//   // CRITICAL: wrap BOTH updates in a single transaction
//   // Either both succeed, or neither. No silent partial state.
//   // ═══════════════════════════════════════════════════════════
//   await this.prisma.$transaction([
//   this.prisma.payment.update({
//     where: { txRef },
//     data: { status: 'paid', paidAt: now, rawResponse: verified as any },
//   }),
//   this.prisma.user.update({
//     where: { id: p.userId },
//     data: updates,
//   }),
// ]);

// this.log.log(
//   `✅ PAID ${txRef} plan=${p.plan} user=${p.userId} updates=${JSON.stringify(updates)}`,
// );

// // ⭐ Cache invalidation — force next fetch to see new tier
// try {
//   await this.redis.delPattern(`matches:${p.userId}*`);
//   await this.redis.delPattern(`user:${p.userId}*`);
//   await this.redis.delPattern(`*:${p.userId}:*`);
//   this.log.log(`[markPaid] invalidated caches for user ${p.userId}`);
// } catch (e) {
//   this.log.warn(`[markPaid] cache invalidation failed: ${(e as Error).message}`);
// }
//   try {
//     await this.notifications.sendToUser(p.userId, {
//       title: 'Payment confirmed 🎉',
//       body: 'Your Barter posts are ready to use.',
//     });
//   } catch (e) {
//     this.log.warn(`push failed: ${(e as Error).message}`);
//   }
// }
//   getPlans() {
//     return Object.values(PLANS).map((p) => ({
//       id: p.id,
//       label: p.label,
//       price: p.price,
//       currency: p.currency,
//       description: p.description,
//       tier: p.tier,
//       badgeKey: p.badgeKey ?? null,
//       highlighted: p.highlighted ?? false,
//       dailyCap: p.dailyCap,
//       periodLimit: p.periodLimit,
//       periodDays: p.periodDays,
//     }));
//   }
// }  

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
import { RedisService } from '../redis/redis.service';

@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chapa: ChapaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
  ) {}

  // ─────────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────────
  async init(userId: string, dto: InitPaymentDto) {
    const plan = PLANS[dto.plan];
    if (!plan) throw new BadRequestException('Unknown plan');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const txRef = `BARTER-${Date.now()}-${randomBytes(4).toString('hex')}`;

    // persist grant info BEFORE calling Chapa (webhook depends on it)
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        txRef,
        amount: plan.price,
        currency: 'ETB',
        plan: dto.plan,

        grantsCredits: plan.periodDays === null ? plan.periodLimit : null,
        grantsProPosts:
          plan.periodDays !== null && plan.periodLimit !== plan.dailyCap
            ? plan.periodLimit
            : null,
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

    // returnUrl with tx_ref
    const deepLink = this.config.get<string>('APP_DEEP_LINK');
    if (!deepLink) throw new Error('APP_DEEP_LINK missing in .env');

    const returnUrl = `${deepLink}${
      deepLink.includes('?') ? '&' : '?'
    }tx_ref=${encodeURIComponent(txRef)}`;
    this.log.log(`[init] returnUrl = ${returnUrl}`);

    // ⭐ sanitize email — Chapa rejects `.local` / `.test` / etc.
    const email = this._safeChapaEmail(user.email);
    this.log.log(`[init] chapa email = ${email} (user.email=${user.email})`);

    // callback URL — must include /api/v1 prefix
    const apiBase = this.config.get<string>('API_PUBLIC_URL');
    if (!apiBase) throw new Error('API_PUBLIC_URL missing in .env');

    const callbackUrl = apiBase.endsWith('/api/v1')
      ? `${apiBase}/payments/webhook`
      : `${apiBase}/api/v1/payments/webhook`;

    // safe name split — never throw on empty name
    const rawName = (user.name ?? '').trim();
    const parts = rawName.split(/\s+/).filter(Boolean);
    const firstName = parts[0] || 'Barter';
    const lastName = parts.slice(1).join(' ') || 'Customer';

    // ⭐ Chapa rejects `init()` on their side → mark payment failed NOW,
    //    don't leave the row pending and rely on cron to clean it up later.
    let checkoutUrl: string;
    try {
      const result = await this.chapa.initialize({
        amount: plan.price,
        currency: 'ETB',
        email,
        firstName,
        lastName,
        phoneNumber: (user as any).phone ?? '0900000000',
        txRef,
        callbackUrl,
        returnUrl,
        title: 'Barter',
        description: plan.label ?? dto.plan,
      });
      checkoutUrl = result.checkoutUrl;
    } catch (e: any) {
      this.log.warn(
        `[init] Chapa initialize failed for ${txRef}: ${(e as Error).message} — marking failed`,
      );
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed' },
      });
      throw new BadRequestException(
        `Could not start payment: ${(e as Error).message}`,
      );
    }

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

  // ⭐ Chapa server-side email validator rejects `.local`, `.test`, etc.
  private _safeChapaEmail(raw?: string | null): string {
    const fallback = 'noreply@barterethio.com';
    if (!raw) return fallback;

    const email = raw.trim().toLowerCase();
    const shape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!shape.test(email)) return fallback;

    const tld = email.split('.').pop()!;
    if (['local', 'localhost', 'test', 'invalid', 'example', 'lan'].includes(tld))
      return fallback;

    const domain = email.split('@').pop()!;
    if (
      ['example.com', 'example.org', 'example.net', 'barter.local'].includes(
        domain,
      )
    )
      return fallback;

    return email;
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC STATUS BY TXREF
  // ─────────────────────────────────────────────────────────
  async getByTxRef(txRef: string) {
    let p = await this.prisma.payment.findUnique({ where: { txRef } });
    if (!p) throw new NotFoundException('Payment not found');

    if (p.status === 'pending') {
      const v = await this.chapa.verify(txRef);
      if (v?.status === 'success') {
        await this.markPaid(txRef, v);
      } else if (v?.status === 'failed') {
        await this.prisma.payment.update({
          where: { id: p.id },
          data: { status: 'failed', rawResponse: v as any },
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
      status: p!.status,
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

    if (p.status === 'pending') {
      const v = await this.chapa.verify(p.txRef);
      if (v?.status === 'success') {
        await this.markPaid(p.txRef, v);
      } else if (v?.status === 'failed') {
        await this.prisma.payment.update({
          where: { id: p.id },
          data: { status: 'failed', rawResponse: v as any },
        });
      }
    }

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
  // WEBHOOK
  // ─────────────────────────────────────────────────────────
  async handleWebhook(body: any) {
    this.log.log(`← Webhook received: ${JSON.stringify(body)}`);

    const candidates: any[] = [
      body?.payload,
      body?.data,
      body?.event_data,
      body?.transaction,
      body,
    ].filter(Boolean);

    let txRef: string | undefined;
    for (const c of candidates) {
      txRef =
        c?.tx_ref ??
        c?.trx_ref ??
        c?.txRef ??
        (typeof c?.reference === 'string' && c.reference.startsWith('BARTER-')
          ? c.reference
          : undefined);
      if (txRef) break;
    }

    if (!txRef) {
      this.log.warn(
        `✗ Webhook missing tx_ref. Top-level keys: [${Object.keys(
          body ?? {},
        ).join(',')}]`,
      );
      return { ok: false };
    }

    this.log.log(`→ Webhook processing: ${txRef}`);

    const v = await this.chapa.verify(txRef);
    if (!v) {
      this.log.warn(`✗ Chapa verify returned null for ${txRef}`);
      return { ok: false };
    }

    this.log.log(
      `✓ Chapa verify: ${txRef} status=${v.status} amount=${v.amount}`,
    );

    if (v.status === 'success') {
      await this.markPaid(txRef, v);
    } else if (v.status === 'failed') {
      await this.prisma.payment.updateMany({
        where: { txRef, status: 'pending' },
        data: { status: 'failed', rawResponse: v as any },
      });
    }
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────
  // MARK PAID — public so PaymentVerifierService can call it
  // ─────────────────────────────────────────────────────────
  async markPaid(txRef: string, verified: any) {
    const p = await this.prisma.payment.findUnique({ where: { txRef } });
    if (!p) {
      this.log.warn(`markPaid: ${txRef} not found`);
      return;
    }

    if (p.status === 'paid') {
      this.log.log(`markPaid: ${txRef} already paid — skipping`);
      return;
    }

    const paid = parseFloat(String(verified.amount ?? '0'));
    this.log.log(
      `markPaid ${txRef}: paid=${paid} expected=${p.amount} ` +
        `grants={credits:${p.grantsCredits}, proPosts:${p.grantsProPosts}, ` +
        `proDays:${p.grantsProDays}, dailyPass:${p.grantsDailyPass}}`,
    );

    if (paid < p.amount - 0.01) {
      this.log.warn(`markPaid: amount mismatch ${txRef} — SKIPPING`);
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: p.userId },
    });
    if (!user) {
      this.log.warn(`markPaid: user ${p.userId} not found`);
      return;
    }

    const now = new Date();
    const updates: any = {};

    if (p.grantsDailyPass) {
      updates.dailyPassExpiresAt = endOfTodayUtc();
      if (user.tier === 'FREE') updates.tier = 'DAILY';
    } else if (p.grantsProPosts && p.grantsProDays) {
      const base =
        user.proExpiresAt && user.proExpiresAt > now ? user.proExpiresAt : now;
      const newEnd = new Date(base);
      newEnd.setDate(newEnd.getDate() + p.grantsProDays);
      updates.proExpiresAt = newEnd;
      updates.proBudgetRemaining =
        (user.proBudgetRemaining ?? 0) + p.grantsProPosts;
      updates.tier = 'PRO';
    } else if (p.grantsCredits) {
      updates.creditsRemaining =
        (user.creditsRemaining ?? 0) + p.grantsCredits;
      if (user.tier === 'FREE') updates.tier = 'CREDIT';
    }

    if (Object.keys(updates).length === 0) {
      this.log.warn(`markPaid: empty updates for ${txRef} — no grants set`);
      await this.prisma.payment.update({
        where: { txRef },
        data: { status: 'paid', paidAt: now, rawResponse: verified as any },
      });
      return;
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

    this.log.log(
      `✅ PAID ${txRef} plan=${p.plan} user=${p.userId} updates=${JSON.stringify(
        updates,
      )}`,
    );

    try {
      await this.redis.delPattern(`matches:${p.userId}*`);
      await this.redis.delPattern(`user:${p.userId}*`);
      await this.redis.delPattern(`*:${p.userId}:*`);
      this.log.log(`[markPaid] invalidated caches for user ${p.userId}`);
    } catch (e) {
      this.log.warn(
        `[markPaid] cache invalidation failed: ${(e as Error).message}`,
      );
    }

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
      badgeKey: p.badgeKey ?? null,
      highlighted: p.highlighted ?? false,
      dailyCap: p.dailyCap,
      periodLimit: p.periodLimit,
      periodDays: p.periodDays,
    }));
  }
}