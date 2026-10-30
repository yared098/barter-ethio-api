import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ChapaService } from './chapa.service';
import { PaymentVerifierService } from './payment-verifier.service';   // ← add
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    NotificationsModule,
    RedisModule
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    ChapaService,
    PaymentVerifierService,     // ← add
  ],
  exports: [PaymentsService, ChapaService],   // ← add exports (recommended)
})
export class PaymentsModule {}