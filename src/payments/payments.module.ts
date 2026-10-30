import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ChapaService } from './chapa.service';
import { PaymentVerifierService } from './payment-verifier.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),   // ← REQUIRED for @Cron
    PrismaModule,
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, ChapaService, PaymentVerifierService],
})
export class PaymentsModule {}