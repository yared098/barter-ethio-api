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
    if (this.bot) {
      this.retries = 0;
      await this.bot.handleUpdate(update);
    }
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

    const bot = new Telegraf(token, {
      handlerTimeout: 30_000,
      telegram: { agent },
    });
    this.bot = bot;

    bot.use(async (_ctx, next) => {
      this.retries = 0;
      return next();
    });
    this.handler.register(bot);
    bot.catch((err, ctx) => {
      this.log.error(
        `🤖 Bot handler error on ${ctx.updateType}: ${(err as Error).message}`,
      );
    });

    this.log.log('🤖 Launching Telegram bot (polling)…');
    void bot.launch({ dropPendingUpdates: false }).catch((e: any) => {
      if (this.bot === bot) this.bot = undefined;

      const telegramCode = e?.response?.error_code ?? e?.code;
      const description =
        e?.response?.description || e?.description || e?.message || 'unknown';
      if (
        Number(telegramCode) === 409 ||
        /409|conflict:.*getupdates/i.test(String(description))
      ) {
        this.log.error(
          `🤖 Telegram polling conflict: ${description}. Stop other processes using this bot token; only one polling instance can run.`,
        );
        try {
          bot.stop('polling-conflict');
        } catch {
          // Telegraf may already have stopped after the failed launch.
        }
        return;
      }

      this.log.error(`🤖 Telegram bot launch failed: ${description}`);
      this._scheduleRetry();
    });
  }
}