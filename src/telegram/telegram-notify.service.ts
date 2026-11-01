import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';

export interface TelegramMessage {
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
}

@Injectable()
export class TelegramNotifyService {
  private readonly log = new Logger(TelegramNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  async sendToUser(userId: string, msg: TelegramMessage) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });
    if (!user?.telegramChatId) return;

    const bot = this.telegram.getBot();
    if (!bot) return;

    // build the message — HTML so we can bold the title
    const text = `🔔 <b>${this.esc(msg.title)}</b>\n\n${this.esc(msg.body)}`;

    // inline button (only if actionUrl provided)
    const replyMarkup =
      msg.actionUrl && msg.actionLabel
        ? {
            inline_keyboard: [[{ text: msg.actionLabel, url: msg.actionUrl }]],
          }
        : undefined;

    try {
      await bot.telegram.sendMessage(user.telegramChatId, text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    } catch (e) {
      this.log.warn(
        `telegram push failed for ${userId}: ${(e as Error).message}`,
      );
    }
  }

  private esc(s: string): string {
    return (s ?? '').replace(/[<>&]/g, (c) =>
      c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;',
    );
  }
}