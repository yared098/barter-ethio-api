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
    const stuck = await this.prisma.payment.findMany({
      where: {
        status: 'pending',
        createdAt: {
          gte: new Date(Date.now() - 2 * 60 * 60 * 1000),  // last 2 hours
          lte: new Date(Date.now() - 5 * 60 * 1000),       // older than 5 min
        },
      },
      take: 20,
    });

    if (stuck.length === 0) return;

    this.log.log(`[recovery] Checking ${stuck.length} stuck payments`);

    for (const p of stuck) {
      try {
        const v = await this.chapa.verify(p.txRef);
        if (v?.status === 'success') {
          await (this.payments as any).markPaid(p.txRef, v);
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
      } catch (e) {
        this.log.warn(
          `[recovery] Error for ${p.txRef}: ${(e as Error).message}`,
        );
      }
    }
  }
}