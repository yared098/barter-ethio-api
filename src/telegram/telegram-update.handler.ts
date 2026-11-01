import { Injectable, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramApiService } from './telegram-api.service';
import { TelegramSessionService } from './telegram-session.service';
import { t, Lang } from './telegram-i18n';
import { kb } from './telegram-keyboards';

@Injectable()
export class TelegramUpdateHandler {
  private readonly log = new Logger(TelegramUpdateHandler.name);

  // ⭐ dedupe concurrent auto-login calls per chat
  private readonly loginInFlight = new Map<string, Promise<boolean>>();

  constructor(
    private readonly api: TelegramApiService,
    private readonly session: TelegramSessionService,
    private readonly prisma: PrismaService,
  ) {}

  register(bot: Telegraf) {
    // ⭐ middleware — silent auto-login by telegram ID, first-time shows prompt
    bot.use(async (ctx, next) => {
      if (ctx.chat && ctx.from && ctx.chat.type === 'private') {
        await this.ensureLoggedIn(ctx);
      }
      return next();
    });

    bot.start((ctx) => this.onStart(ctx));

    // button taps
    bot.action(/^menu:browse$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onBrowse(ctx, 1, true);
    });
    bot.action(/^menu:refresh$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onBrowse(ctx, 1, true);
    });
    bot.action(/^browse:(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const page = parseInt((ctx.match as RegExpMatchArray)[1], 10) || 1;
      return this.onBrowse(ctx, page, true);
    });

    // free text — only used during login
    bot.on('text', (ctx) => this.onText(ctx));
  }

  // ═══════════════════════════════════════════════════════════
  // AUTO-LOGIN (silent) — checks DB, never creates
  // ═══════════════════════════════════════════════════════════

  private async ensureLoggedIn(ctx: any): Promise<boolean> {
    const chatId = ctx.chat?.id;
    const from = ctx.from;
    if (!chatId || !from) return false;

    const key = String(chatId);

    const s = this.session.get(chatId);
    if (s?.jwt) return true;

    // dedupe parallel calls for the same chat
    const inflight = this.loginInFlight.get(key);
    if (inflight) return inflight;

    const promise = (async (): Promise<boolean> => {
      try {
        const resp = await this.api.telegramLookup(String(from.id));
        this.session.set(chatId, {
          lang: s?.lang ?? 'en',
          jwt: resp.accessToken,
          userId: resp.user.id,
          userName:
            resp.user.name ?? resp.user.email ?? from.username ?? 'User',
          expiresAt: 0,
        });
        this.log.debug(
          `auto-login OK for tg=${from.id} → user=${resp.user.id}`,
        );
        return true;
      } catch (e: any) {
        // 401 = not linked yet → first-time flow will run
        const code = e?.response?.status;
        if (code !== 401) {
          this.log.warn(
            `auto-login FAILED for tg=${from.id}: ${(e as Error).message}`,
          );
        }
        return false;
      }
    })();

    this.loginInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.loginInFlight.delete(key);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  private lang(chatId: number | string): Lang {
    return this.session.get(chatId)?.lang ?? 'en';
  }

  private async deleteMessageSafe(ctx: any, msgId: number) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat!.id, msgId);
    } catch {
      /* ignore */
    }
  }

  private esc(s: string): string {
    return (s ?? '').replace(/[<>&]/g, (c) =>
      c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;',
    );
  }

  // ═══════════════════════════════════════════════════════════
  // /start
  // ═══════════════════════════════════════════════════════════

  private async onStart(ctx: any) {
    const id = ctx.chat.id;
    const L = t(this.lang(id));
    const s = this.session.get(id);

    // already logged in
    if (s?.jwt) {
      const text = L.welcomeBack(s.userName ?? 'there');
      return ctx.reply(text, {
        parse_mode: 'Markdown',
        ...kb.mainMenu(),
      });
    }

    // first-time → start login flow
    this.session.set(id, {
      lang: s?.lang ?? 'en',
      step: 'awaiting_email',
      expiresAt: 0,
    });

    return ctx.reply(L.welcomeFirstTime, {
      parse_mode: 'Markdown',
      reply_markup: { force_reply: true, selective: true },
    });
  }

  // ═══════════════════════════════════════════════════════════
  // BROWSE
  // ═══════════════════════════════════════════════════════════

  private async onBrowse(ctx: any, page = 1, edit = false) {
    const id = ctx.chat.id;
    const L = t(this.lang(id));
    const s = this.session.get(id);

    if (!s?.jwt) {
      // session lost → re-prompt
      return this.onStart(ctx);
    }

    try {
      const resp = await this.api.listRequests(s.jwt, page, 5);
      const items = resp.items ?? [];

      if (!items.length) {
        const text = L.browseEmpty;
        return edit ? ctx.editMessageText(text, kb.mainMenu()) : ctx.reply(text, kb.mainMenu());
      }

      const totalPages = resp.pagination?.totalPages ?? 1;
      const lines = items.map((r: any, i: number) => {
        const icon = r.category?.icon ?? '📦';
        const cat = r.category?.name ?? '—';
        const budget =
          r.budgetMin || r.budgetMax
            ? `💰 ${r.budgetMin ?? 0}–${r.budgetMax ?? '∞'} ETB`
            : '💰 —';
        const loc = r.location ? ` · 📍 ${r.location}` : '';
        return (
          `<b>${i + 1}. ${this.esc(r.title)}</b>\n` +
          `${icon} ${this.esc(cat)} · ${r.type}${loc}\n` +
          `${budget}\n` +
          `<i>${this.esc((r.description ?? '').slice(0, 80))}…</i>`
        );
      });

      const header =
        totalPages > 1 ? L.browsePage(page, totalPages) : L.browseTitle;
      const text = `${header}\n\n` + lines.join('\n\n');

      const rows: any[] = [];
      const pagerRow: any[] = [];
      if (page > 1)
        pagerRow.push(
          { text: '◀ Prev', callback_data: `browse:${page - 1}` },
        );
      if (resp.pagination?.hasMore === true)
        pagerRow.push(
          { text: 'Next ▶', callback_data: `browse:${page + 1}` },
        );
      if (pagerRow.length) rows.push(pagerRow);
      rows.push([{ text: '🔄 Refresh', callback_data: 'menu:refresh' }]);

      const opts = {
        parse_mode: 'HTML' as const,
        reply_markup: { inline_keyboard: rows },
      };

      return edit ? ctx.editMessageText(text, opts) : ctx.reply(text, opts);
    } catch (e: any) {
      this.log.warn(`browse failed: ${(e as Error).message}`);

      // session expired → re-login
      if (e?.response?.status === 401) {
        this.session.destroy(id);
        return this.onStart(ctx);
      }

      const msg = L.cannotReachServer;
      return edit ? ctx.editMessageText(msg, kb.mainMenu()) : ctx.reply(msg, kb.mainMenu());
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FREE-TEXT — login flow only
  // ═══════════════════════════════════════════════════════════

  private async onText(ctx: any) {
    const id = ctx.chat.id;
    const text = (ctx.message as Message.TextMessage).text.trim();
    const s = this.session.get(id);
    if (!s?.step) return;

    // ── email step ──
    if (s.step === 'awaiting_email') {
      const email = text.toLowerCase();
      const shape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const L = t(s.lang);

      if (!shape.test(email)) {
        return ctx.reply(L.badEmail, {
          reply_markup: { force_reply: true, selective: true },
        });
      }

      this.session.set(id, {
        lang: s.lang,
        step: 'awaiting_password',
        pendingEmail: email,
        expiresAt: 0,
      });

      return ctx.reply(L.askPassword, {
        parse_mode: 'Markdown',
        reply_markup: { force_reply: true, selective: true },
      });
    }

    // ── password step ──
    if (s.step === 'awaiting_password') {
      const L = t(s.lang);
      this.deleteMessageSafe(ctx, ctx.message.message_id);

      if (text.length < 6) {
        return ctx.reply(L.badPassword, {
          reply_markup: { force_reply: true, selective: true },
        });
      }

      const email = s.pendingEmail;
      if (!email) {
        this.session.clearLogin(id);
        return this.onStart(ctx);
      }

      try {
        const resp = await this.api.telegramLink({
          email,
          password: text,
          telegramId: String(ctx.from.id),
          telegramUsername: ctx.from.username,
        });

        this.session.set(id, {
          lang: s.lang,
          jwt: resp.accessToken,
          userId: resp.user.id,
          userName: resp.user.name ?? resp.user.email ?? 'there',
          expiresAt: 0,
        });

        const text2 = L.loginOk(resp.user.name ?? resp.user.email ?? 'there');
        return ctx.reply(text2, {
          parse_mode: 'Markdown',
          ...kb.mainMenu(),
        });
      } catch (e: any) {
        const status = e?.response?.status;
        this.session.clearLogin(id);

        if (status === 401) {
          // wrong password or email
          this.session.set(id, {
            lang: s.lang,
            step: 'awaiting_email',
            expiresAt: 0,
          });
          return ctx.reply(L.loginFail, {
            reply_markup: { force_reply: true, selective: true },
          });
        }

        this.log.warn(`telegramLink failed: ${(e as Error).message}`);
        return ctx.reply(L.cannotReachServer, kb.mainMenu());
      }
    }
  }
}