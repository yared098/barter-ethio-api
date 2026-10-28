// src/requests/requests.module.ts
import { Module } from '@nestjs/common';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { RequestsCron } from './requests.cron';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [RequestsController],
  providers: [RequestsService, RequestsCron],
})
export class RequestsModule {}