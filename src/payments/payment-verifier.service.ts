// import { Injectable, Logger } from '@nestjs/common';
// import { Cron, CronExpression } from '@nestjs/schedule';
// import { PrismaService } from '../prisma/prisma.service';
// import { ChapaService } from './chapa.service';
// import { PaymentsService } from './payments.service';

// @Injectable()
// export class PaymentVerifierService {
//   private readonly log = new Logger(PaymentVerifierService.name);

//   constructor(
//     private readonly prisma: PrismaService,
//     private readonly chapa: ChapaService,
//     private readonly payments: PaymentsService,
//   ) {}

//   @Cron(CronExpression.EVERY_5_MINUTES)
//   async recoverStuckPayments() {
//     const stuck = await this.prisma.payment.findMany({
//       where: {
//         status: 'pending',
//         createdAt: {
//           gte: new Date(Date.now() - 2 * 60 * 60 * 1000),  // last 2 hours
//           lte: new Date(Date.now() - 5 * 60 * 1000),       // older than 5 min
//         },
//       },
//       take: 20,
//     });

//     if (stuck.length === 0) return;

//     this.log.log(`[recovery] Checking ${stuck.length} stuck payments`);

//     for (const p of stuck) {
//       try {
//         const v = await this.chapa.verify(p.txRef);
//         if (v?.status === 'success') {
//           await (this.payments as any).markPaid(p.txRef, v);
//           this.log.log(`[recovery] ✅ Recovered ${p.txRef}`);
//         } else if (v?.status === 'failed') {
//           await this.prisma.payment.update({
//             where: { id: p.id },
//             data: { status: 'failed' },
//           });
//           this.log.log(`[recovery] ❌ Failed ${p.txRef}`);
//         } else if (p.expiresAt < new Date()) {
//           await this.prisma.payment.update({
//             where: { id: p.id },
//             data: { status: 'expired' },
//           });
//         }
//       } catch (e) {
//         this.log.warn(
//           `[recovery] Error for ${p.txRef}: ${(e as Error).message}`,
//         );
//       }
//     }
//   }
// }  

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ChapaService } from './chapa.service';
import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentVerifierService {
  private readonly log = new Logger(PaymentVerifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chapa: ChapaService,
    private readonly payments: PaymentsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async recoverStuckPayments() {
    const now = Date.now();
    const fiveMinAgo = new Date(now - 5 * 60 * 1000);
    const twentyMinAgo = new Date(now - 20 * 60 * 1000);
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);

    // ── STEP 1: mark ancient pending (older than 20 min) as failed
    //    without touching Chapa — these are init failures, they'll never
    //    be found in Chapa's system, calling verify() just spams 400 errors.
    const stale = await this.prisma.payment.updateMany({
      where: {
        status: 'pending',
        createdAt: { lt: twentyMinAgo },
      },
      data: { status: 'failed' },
    });
    if (stale.count > 0) {
      this.log.log(
        `[recovery] marked ${stale.count} stale pending payment(s) as failed`,
      );
    }

    // ── STEP 2: verify only the RECENT pending (5–20 min old).
    //    These might actually be in Chapa's system and paid — worth checking.
    const candidates = await this.prisma.payment.findMany({
      where: {
        status: 'pending',
        createdAt: { gte: twentyMinAgo, lte: fiveMinAgo },
      },
      take: 20,
    });

    if (candidates.length === 0) return;

    this.log.log(
      `[recovery] verifying ${candidates.length} recent pending payment(s)`,
    );

    for (const p of candidates) {
      try {
        const v = await this.chapa.verify(p.txRef);

        if (v?.status === 'success') {
          await this.payments.markPaid(p.txRef, v);
          this.log.log(`[recovery] ✅ Recovered ${p.txRef}`);
        } else if (v?.status === 'failed') {
          await this.prisma.payment.update({
            where: { id: p.id },
            data: { status: 'failed' },
          });
          this.log.log(`[recovery] ❌ Failed ${p.txRef}`);
        } else if (p.expiresAt < new Date()) {
          await this.prisma.payment.update({
            where: { id: p.id },
            data: { status: 'expired' },
          });
        }
        // status === 'pending' on Chapa side → leave it, try next cron tick
        // status === null from verify() → likely 400 Invalid transaction ref,
        //   but it's <20min old so Chapa might still know about it — retry
      } catch (e) {
        this.log.warn(
          `[recovery] Error for ${p.txRef}: ${(e as Error).message}`,
        );
      }
    }
  }
}