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

    const text = `🔔 <b>${this.esc(msg.title)}</b>\n\n${this.esc(msg.body)}`;

    // ⭐ ONLY add a button if the URL is a scheme Telegram accepts.
    //    Custom schemes like `barterethio://` cause a 400 Bad Request.
    const isSafe =
      !!msg.actionUrl &&
      /^(https?:\/\/|tg:\/\/)/i.test(msg.actionUrl) &&
      !!msg.actionLabel;

    const replyMarkup = isSafe
      ? {
          inline_keyboard: [[{ text: msg.actionLabel!, url: msg.actionUrl! }]],
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