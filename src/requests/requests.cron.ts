// src/requests/requests.cron.ts
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RequestsCron {
  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async expire() {
    const now = new Date();
    await this.prisma.request.updateMany({
      where: {
        status: 'OPEN',
        expiresAt: { not: null, lt: now },
      },
      data: { status: 'EXPIRED', closedAt: now },
    });
  }
}