import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';

@Injectable()
export class TelegramNotifyService {
  private readonly log = new Logger(TelegramNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  async sendToUser(userId: string, msg: { title: string; body: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });
    if (!user?.telegramChatId) return;

    const bot = this.telegram.getBot();
    if (!bot) return;

    try {
      await bot.telegram.sendMessage(
        user.telegramChatId,
        `🔔 <b>${this.esc(msg.title)}</b>\n\n${this.esc(msg.body)}`,
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
      );
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