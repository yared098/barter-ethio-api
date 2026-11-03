import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private readonly config: ConfigService,
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

    // Convert the app's internal offer link into a Telegram Web App button.
    const offerId = msg.actionUrl?.match(
      /^barterethio:\/\/offer\/([A-Za-z0-9_-]+)$/,
    )?.[1];
    const webAppUrl = this.chatWebAppUrl(offerId);
    const isSafeUrl =
      !!msg.actionUrl &&
      /^(https?:\/\/|tg:\/\/)/i.test(msg.actionUrl) &&
      !!msg.actionLabel;
    const replyMarkup = msg.actionLabel
      ? webAppUrl
        ? {
            inline_keyboard: [
              [{ text: msg.actionLabel, web_app: { url: webAppUrl } }],
            ],
          }
        : isSafeUrl
          ? {
              inline_keyboard: [
                [{ text: msg.actionLabel, url: msg.actionUrl! }],
              ],
            }
          : undefined
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

  private chatWebAppUrl(offerId?: string): string | undefined {
    if (!offerId) return undefined;
    const configuredUrl =
      this.config.get<string>('TELEGRAM_WEB_APP_URL') ||
      'https://warm-cobbler-1586ce.netlify.app/chat';
    if (!configuredUrl) return undefined;

    const base = new URL(configuredUrl);
    let path = base.pathname.replace(/\/+$/, '');
    if (/\/chat\/[^/]+$/.test(path)) {
      path = path.slice(0, path.lastIndexOf('/'));
    }
    base.pathname = `${path}/${encodeURIComponent(offerId)}`.replace(
      /\/{2,}/g,
      '/',
    );
    base.search = '';
    base.hash = '';
    return base.toString();
  }
}