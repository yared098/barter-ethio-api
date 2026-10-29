import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsCron {
  private readonly log = new Logger(PaymentsCron.name);
  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 */10 * * * *') // every 10 minutes
  async expirePlans() {
    const now = new Date();

    // PRO expired → fall back to DAILY → CREDIT → FREE
    const proExpired = await this.prisma.user.findMany({
      where: { tier: 'PRO', proExpiresAt: { lte: now } },
    });
    for (const u of proExpired) {
      const nextTier =
        u.dailyPassExpiresAt && u.dailyPassExpiresAt > now
          ? 'DAILY'
          : (u.creditsRemaining ?? 0) > 0
            ? 'CREDIT'
            : 'FREE';

      await this.prisma.user.update({
        where: { id: u.id },
        data: {
          tier: nextTier,
          proExpiresAt: null,
          proBudgetRemaining: null, // budget lost at expiry
        },
      });
      this.log.log(`PRO expired ${u.id} → ${nextTier}`);
    }

    // DAILY expired → CREDIT or FREE
    const dailyExpired = await this.prisma.user.findMany({
      where: { tier: 'DAILY', dailyPassExpiresAt: { lte: now } },
    });
    for (const u of dailyExpired) {
      const nextTier = (u.creditsRemaining ?? 0) > 0 ? 'CREDIT' : 'FREE';
      await this.prisma.user.update({
        where: { id: u.id },
        data: { tier: nextTier, dailyPassExpiresAt: null },
      });
      this.log.log(`DAILY expired ${u.id} → ${nextTier}`);
    }

    // Pending payments past TTL
    await this.prisma.payment.updateMany({
      where: { status: 'pending', expiresAt: { lt: now } },
      data: { status: 'expired' },
    });
  }
}