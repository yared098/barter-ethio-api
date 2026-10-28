import { Module } from '@nestjs/common';
import { BiddingController } from './bidding.controller';
import { BiddingService } from './bidding.service';
import { BiddingCron } from './bidding.cron';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [BiddingController],
  providers: [BiddingService, BiddingCron],
  exports: [BiddingService],
})
export class BiddingModule {}
