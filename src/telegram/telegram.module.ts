import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramService } from './telegram.service';
import { TelegramApiService } from './telegram-api.service';
import { TelegramSessionService } from './telegram-session.service';
import { TelegramUpdateHandler } from './telegram-update.handler';
import { TelegramNotifyService } from './telegram-notify.service';
import { TelegramController } from './telegram.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TelegramController],
  providers: [
    TelegramService,
    TelegramApiService,
    TelegramSessionService,
    TelegramUpdateHandler,
    TelegramNotifyService,
  ],
  exports: [TelegramNotifyService],
})
export class TelegramModule {}