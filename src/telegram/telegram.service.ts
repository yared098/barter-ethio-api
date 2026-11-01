import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import * as https from 'https';
import { TelegramUpdateHandler } from './telegram-update.handler';

const TOKEN_SHAPE = /^\d+:[A-Za-z0-9_-]{30,}$/;
const MAX_RETRIES = 20;

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TelegramService.name);
  private bot?: Telegraf;
  private retryTimer?: NodeJS.Timeout;
  private retries = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly handler: TelegramUpdateHandler,
  ) {}

  async onModuleInit() {
    this._start().catch((e) => {
      this.log.error(
        `🤖 Telegram bot DISABLED (API still runs): ${(e as Error).message}`,
      );
      this._scheduleRetry();
    });
  }

  async onModuleDestroy() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    try {
      this.bot?.stop('shutdown');
    } catch {
      /* ignore */
    }
  }

  getBot(): Telegraf | undefined {
    return this.bot;
  }

  async handleUpdate(update: any) {
    if (this.bot) await this.bot.handleUpdate(update);
  }

  private _scheduleRetry() {
    if (this.retries >= MAX_RETRIES) {
      this.log.error(`🤖 Giving up after ${MAX_RETRIES} retries.`);
      return;
    }
    this.retries += 1;
    const delay = Math.min(60_000, 10_000 * this.retries);
    this.log.warn(
      `🤖 Retrying Telegram bot in ${delay / 1000}s (attempt ${this.retries}/${MAX_RETRIES})…`,
    );
    this.retryTimer = setTimeout(() => {
      this._start().catch((e) => {
        this.log.error(`🤖 Retry failed: ${(e as Error).message}`);
        this._scheduleRetry();
      });
    }, delay);
  }

  private _buildAgent(): https.Agent | undefined {
    const proxyUrl =
      process.env.HTTPS_PROXY || process.env.https_proxy;
    if (proxyUrl) {
      try {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        return new HttpsProxyAgent(proxyUrl);
      } catch {
        /* fall through to direct */
      }
    }
    this.log.log('🤖 direct connection with forced IPv4');
    return new https.Agent({
      keepAlive: true,
      family: 4,
      timeout: 30_000,
    });
  }

  private async _start() {
    const raw = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!raw) {
      this.log.warn('🤖 TELEGRAM_BOT_TOKEN not set — bot disabled');
      return;
    }

    const token = raw.replace(/^bot/i, '').trim();

    if (!TOKEN_SHAPE.test(token)) {
      this.log.error(
        `🤖 TELEGRAM_BOT_TOKEN malformed (length=${token.length}). Bot disabled.`,
      );
      return;
    }

    // preflight via native fetch
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getMe`,
        { signal: AbortSignal.timeout(10_000) },
      );
      const json: any = await res.json();
      if (!json?.ok) {
        this.log.error(
          `🤖 Telegram auth FAILED: ${json?.description ?? 'unknown'}. Bot disabled.`,
        );
        return;
      }
      this.log.log(
        `🤖 Telegram identity OK → @${json.result.username} (id=${json.result.id})`,
      );
    } catch (e: any) {
      const msg = e?.cause?.code || e?.code || e?.message || 'unknown';
      throw new Error(`Cannot reach api.telegram.org: ${msg}`);
    }

    const agent = this._buildAgent();

    this.bot = new Telegraf(token, {
      handlerTimeout: 30_000,
      telegram: { agent },
    });

    this.handler.register(this.bot);
    this.bot.catch((err, ctx) => {
      this.log.error(
        `🤖 Bot handler error on ${ctx.updateType}: ${(err as Error).message}`,
      );
    });

    this.log.log('🤖 Launching Telegram bot (polling)…');
    this.bot
      .launch({ dropPendingUpdates: false })
      .catch((e: any) => {
        const code =
          e?.cause?.code || e?.code || e?.errno || e?.message || 'unknown';
        this.log.error(
          `🤖 bot launch crashed (${code}). Fix: set HTTPS_PROXY or enable webhook mode.`,
        );
        this._scheduleRetry();
      });

    this.log.log('🤖 Telegram bot (polling) started');
    this.retries = 0;
  }
}