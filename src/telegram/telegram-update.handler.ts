import { Injectable, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { TelegramApiService } from './telegram-api.service';
import { TelegramSessionService } from './telegram-session.service';
import { t, Lang } from './telegram-i18n';
import { kb } from './telegram-keyboards';

@Injectable()
export class TelegramUpdateHandler {
  private readonly log = new Logger(TelegramUpdateHandler.name);
  private readonly loginInFlight = new Map<string, Promise<boolean>>();
  private categoriesCache?: {
    data: { id: string; name: string; icon?: string }[];
    at: number;
  };

  constructor(
    private readonly api: TelegramApiService,
    private readonly session: TelegramSessionService,
  ) {}

  register(bot: Telegraf) {
    // silent auto-login (already-linked users)
    bot.use(async (ctx, next) => {
      if (ctx.chat && ctx.from && ctx.chat.type === 'private') {
        await this.ensureLoggedIn(ctx);
      }
      return next();
    });

    bot.start((ctx) => this.onStart(ctx));
    bot.help((ctx) => this.onHelp(ctx));

    // ── menu ──────────────────────────────────────────────
    bot.action(/^menu:home$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.showHome(ctx, true);
    });
    bot.action(/^menu:browse$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onBrowse(ctx, 1, undefined, true);
    });
    bot.action(/^menu:post$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onPost(ctx, true);
    });
    bot.action(/^menu:matches$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onMatches(ctx, true);
    });
    bot.action(/^menu:me$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onMe(ctx, true);
    });
    bot.action(/^menu:lang$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onLangPicker(ctx, true);
    });

    // ── browse ────────────────────────────────────────────
    bot.action(/^browse:(\d+):(.*)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const m = ctx.match as RegExpMatchArray;
      const page = parseInt(m[1], 10) || 1;
      const catId = m[2] || undefined;
      return this.onBrowse(ctx, page, catId, true);
    });
    bot.action(/^browse:filter$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onBrowseFilter(ctx);
    });
    bot.action(/^browse:cat:(.+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const catId = (ctx.match as RegExpMatchArray)[1];
      return this.onBrowse(ctx, 1, catId === 'all' ? undefined : catId, true);
    });

    // ── request detail ────────────────────────────────────
    bot.action(/^detail:(.+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const id = (ctx.match as RegExpMatchArray)[1];
      return this.onRequestDetail(ctx, id);
    });

    // ── language ──────────────────────────────────────────
    bot.action(/^lang:(en|am)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const next = (ctx.match as RegExpMatchArray)[1] as Lang;
      const id = ctx.chat!.id;
      const s = this.session.get(id);
      if (s) this.session.set(id, { ...s, lang: next });
      const L = t(next);
      return ctx.editMessageText(L.langSwitched, {
        parse_mode: 'Markdown',
        ...kb.backToMenu(),
      });
    });

    // ── post flow ─────────────────────────────────────────
    bot.action(/^post:cat:(.+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onPostCategory(ctx);
    });
    bot.action(/^post:type:(BUY|BARTER|EITHER)$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onPostType(ctx);
    });
    bot.action(/^post:budget:skip$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onPostBudgetSkip(ctx);
    });
    bot.action(/^post:confirm$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onPostConfirm(ctx);
    });
    bot.action(/^post:cancel$/, async (ctx) => {
      await ctx.answerCbQuery();
      const id = ctx.chat!.id;
      this.session.clearStep(id);
      return this.showHome(ctx, true);
    });

    // free text
    bot.on('text', (ctx) => this.onText(ctx));
  }

  // ═══════════════════════════════════════════════════════
  // AUTO-LOGIN
  // ═══════════════════════════════════════════════════════
  private async ensureLoggedIn(ctx: any): Promise<boolean> {
    const chatId = ctx.chat?.id;
    const from = ctx.from;
    if (!chatId || !from) return false;

    const key = String(chatId);
    const s = this.session.get(chatId);
    if (s?.jwt) return true;

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
        return true;
      } catch (e: any) {
        const status = e?.response?.status;
        if (status !== 401) {
          this.log.warn(
            `auto-login failed for tg=${from.id}: ${(e as Error).message}`,
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

  // ═══════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════
  private lang(id: number | string): Lang {
    return this.session.get(id)?.lang ?? 'en';
  }

  private esc(s: string): string {
    return (s ?? '').replace(/[<>&]/g, (c) =>
      c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;',
    );
  }

  private async delMsg(ctx: any, msgId: number) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat!.id, msgId);
    } catch { /* ignore */ }
  }

  private async getCategories() {
    const now = Date.now();
    if (this.categoriesCache && now - this.categoriesCache.at < 10 * 60_000) {
      return this.categoriesCache.data;
    }
    const data = await this.api.categories();
    this.categoriesCache = { data, at: now };
    return data;
  }

  // ═══════════════════════════════════════════════════════
  // HOME / START
  // ═══════════════════════════════════════════════════════
  private async showHome(ctx: any, edit = false) {
    const id = ctx.chat.id;
    const s = this.session.get(id);
    const L = t(this.lang(id));

    if (!s?.jwt) {
      // not logged in → start login
      return this.onStart(ctx);
    }

    const text = L.welcomeBack(s.userName ?? 'there');
    const opts = { parse_mode: 'Markdown' as const, ...kb.mainMenu() };
    return edit ? ctx.editMessageText(text, opts) : ctx.reply(text, opts);
  }

  private async onStart(ctx: any) {
    const id = ctx.chat.id;
    const s = this.session.get(id);
    const L = t(this.lang(id));

    if (s?.jwt) return this.showHome(ctx, false);

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

  private async onHelp(ctx: any) {
    const id = ctx.chat.id;
    return ctx.reply(
      '*Commands*\n' +
        '/start — main menu\n' +
        '/browse — wanted board\n' +
        '/post — post a request\n' +
        '/matches — your matches\n' +
        '/me — account info\n' +
        '/lang — switch language',
      { parse_mode: 'Markdown', ...kb.backToMenu() },
    );
  }

  // ═══════════════════════════════════════════════════════
  // BROWSE
  // ═══════════════════════════════════════════════════════
  private async onBrowse(
    ctx: any,
    page = 1,
    categoryId?: string,
    edit = false,
  ) {
    const id = ctx.chat.id;
    const s = this.session.get(id);
    const L = t(this.lang(id));
    if (!s?.jwt) return this.onStart(ctx);

    try {
      const resp = await this.api.listRequests(s.jwt, page, 5, categoryId);
      const items = resp.items ?? [];

      this.session.patch(id, { browsePage: page, browseCategory: categoryId });

      if (!items.length) {
        const text = L.browseEmpty;
        const opts = { parse_mode: 'Markdown' as const, ...kb.browseMenu(1, false, categoryId) };
        return edit ? ctx.editMessageText(text, opts) : ctx.reply(text, opts);
      }

      const totalPages = resp.pagination?.totalPages ?? 1;
      const catName = categoryId
        ? items[0]?.category?.name
        : undefined;
      const header =
        totalPages > 1
          ? L.browsePage(page, totalPages, catName)
          : L.browseTitle(catName);

      const lines = items.map((r: any, i: number) => {
        const icon = r.category?.icon ?? '📦';
        const cat = r.category?.name ?? '—';
        const budget =
          r.budgetMin || r.budgetMax
            ? `💰 ${r.budgetMin ?? 0}–${r.budgetMax ?? '∞'} ETB`
            : '💰 —';
        const loc = r.location ? ` · 📍 ${r.location}` : '';
        return (
          `<b>${i + 1}. ${this.esc(r.title)}</b> (id:${r.id})\n` +
          `${icon} ${this.esc(cat)} · ${r.type}${loc}\n` +
          `${budget}\n` +
          `<i>${this.esc((r.description ?? '').slice(0, 100))}…</i>`
        );
      });

      const text = `${header}\n\n` + lines.join('\n\n');
      const keyboard = kb.browseMenu(
        page,
        resp.pagination?.hasMore === true,
        categoryId,
      );

      const opts = { parse_mode: 'HTML' as const, ...keyboard };
      return edit ? ctx.editMessageText(text, opts) : ctx.reply(text, opts);
    } catch (e: any) {
      this.log.warn(`browse failed: ${(e as Error).message}`);
      const msg = L.cannotReachServer;
      const opts = { parse_mode: 'Markdown' as const, ...kb.backToMenu() };
      return edit ? ctx.editMessageText(msg, opts) : ctx.reply(msg, opts);
    }
  }

  private async onBrowseFilter(ctx: any) {
    const id = ctx.chat.id;
    const L = t(this.lang(id));
    const cats = await this.getCategories();
    return ctx.editMessageText(L.pickCategory, {
      parse_mode: 'Markdown',
      ...kb.categoryPicker(cats, true),
    });
  }

  private async onRequestDetail(ctx: any, requestId: string) {
    const id = ctx.chat.id;
    const s = this.session.get(id);
    const L = t(this.lang(id));
    if (!s?.jwt) return this.onStart(ctx);

    try {
      const r = await this.api.getRequest(s.jwt, requestId);
      const budget =
        r.budgetMin || r.budgetMax
          ? `${r.budgetMin ?? 0}–${r.budgetMax ?? '∞'} ETB`
          : '—';

      const text =
        `${L.detailTitle}\n\n` +
        `<b>${this.esc(r.title)}</b>\n\n` +
        `${this.esc(r.description ?? '')}\n\n` +
        `📂 ${this.esc(r.category?.name ?? '—')}\n` +
        `💱 ${r.type}\n` +
        `💰 ${budget}\n` +
        (r.location ? `📍 ${this.esc(r.location)}\n` : '') +
        `👤 ${this.esc(r.author?.name ?? 'Anonymous')}\n` +
        `📅 ${new Date(r.createdAt).toDateString()}`;

      const s2 = this.session.get(id);
      return ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...kb.requestDetail(
          requestId,
          s2?.browsePage ?? 1,
          s2?.browseCategory ?? '',
        ),
      });
    } catch (e: any) {
      this.log.warn(`detail failed: ${(e as Error).message}`);
      return ctx.answerCbQuery('Could not load');
    }
  }

  // ═══════════════════════════════════════════════════════
  // MATCHES
  // ═══════════════════════════════════════════════════════
  private async onMatches(ctx: any, edit = false) {
    const id = ctx.chat.id;
    const s = this.session.get(id);
    const L = t(this.lang(id));
    if (!s?.jwt) return this.onStart(ctx);

    try {
      const data = await this.api.matches(s.jwt);
      const items: any[] =
        data?.matches ?? data?.items ?? (Array.isArray(data) ? data : []);

      const text = items.length
        ? L.matchesTitle + '\n\n' +
          items
            .slice(0, 5)
            .map((m: any, i: number) => {
              const p = m.product ?? m;
              const score = m.score ?? m.matchScore ?? '—';
              return (
                `<b>${i + 1}. ${this.esc(p.title ?? '—')}</b>\n` +
                `💰 ${p.estimatedValue ?? '—'} ETB · ${p.condition ?? '—'}\n` +
                `🎯 Match: ${score}`
              );
            })
            .join('\n\n')
        : L.matchesEmpty;

      const opts = { parse_mode: 'HTML' as const, ...kb.backToMenu() };
      return edit ? ctx.editMessageText(text, opts) : ctx.reply(text, opts);
    } catch (e) {
      this.log.warn(`matches failed: ${(e as Error).message}`);
      const opts = { parse_mode: 'Markdown' as const, ...kb.backToMenu() };
      return edit
        ? ctx.editMessageText(L.cannotReachServer, opts)
        : ctx.reply(L.cannotReachServer, opts);
    }
  }

  // ═══════════════════════════════════════════════════════
  // ME
  // ═══════════════════════════════════════════════════════
  private async onMe(ctx: any, edit = false) {
    const id = ctx.chat.id;
    const s = this.session.get(id);
    const L = t(this.lang(id));
    if (!s?.jwt) return this.onStart(ctx);

    try {
      const [me, status] = await Promise.all([
        this.api.me(s.jwt),
        this.api.postingStatus(s.jwt).catch(() => null),
      ]);

      const lines = [
        L.meHeader,
        '',
        `👤 <b>${this.esc(me.name ?? '—')}</b>`,
        `📧 ${this.esc(me.email ?? '—')}`,
        `🎚 Tier: <b>${me.tier ?? 'FREE'}</b>`,
        `💳 Credits: ${me.creditsRemaining ?? 0}`,
        me.proExpiresAt
          ? `⏳ PRO until: ${new Date(me.proExpiresAt).toDateString()}`
          : '',
        status ? `📅 Today: ${status.used ?? 0}/${status.limit ?? 0}` : '',
      ].filter(Boolean);

      const opts = { parse_mode: 'HTML' as const, ...kb.backToMenu() };
      const text = lines.join('\n');
      return edit ? ctx.editMessageText(text, opts) : ctx.reply(text, opts);
    } catch (e) {
      this.log.warn(`me failed: ${(e as Error).message}`);
      const opts = { parse_mode: 'Markdown' as const, ...kb.backToMenu() };
      return edit
        ? ctx.editMessageText(L.cannotReachServer, opts)
        : ctx.reply(L.cannotReachServer, opts);
    }
  }

  // ═══════════════════════════════════════════════════════
  // LANGUAGE
  // ═══════════════════════════════════════════════════════
  private async onLangPicker(ctx: any, edit = false) {
    const text = '🌐 *Choose your language*\n\nPick EN or አማርኛ:';
    const opts = { parse_mode: 'Markdown' as const, ...kb.langPicker() };
    return edit ? ctx.editMessageText(text, opts) : ctx.reply(text, opts);
  }

  // ═══════════════════════════════════════════════════════
  // POST FLOW
  // ═══════════════════════════════════════════════════════
  private async onPost(ctx: any, edit = false) {
    const id = ctx.chat.id;
    const s = this.session.get(id);
    const L = t(this.lang(id));
    if (!s?.jwt) return this.onStart(ctx);

    try {
      const cats = await this.getCategories();
      this.session.patch(id, { step: undefined, draft: {} });
      const opts = { parse_mode: 'Markdown' as const, ...kb.postCategoryPicker(cats) };
      return edit ? ctx.editMessageText(L.postAskCategory, opts) : ctx.reply(L.postAskCategory, opts);
    } catch (e) {
      return ctx.reply(L.cannotReachServer, kb.backToMenu());
    }
  }

  private async onPostCategory(ctx: any) {
    const id = ctx.chat.id;
    const L = t(this.lang(id));
    const categoryId = (ctx.match as RegExpMatchArray)[1];
    const cats = await this.getCategories();
    const cat = cats.find((c) => c.id === categoryId);

    const s = this.session.get(id) ?? { lang: 'en' as Lang, expiresAt: 0 };
    this.session.set(id, {
      ...s,
      step: 'awaiting_title',
      draft: {
        categoryId,
        categoryName: cat?.name,
      },
    });

    return ctx.editMessageText(L.postAskTitle);
  }

  private async onPostType(ctx: any) {
    const id = ctx.chat.id;
    const L = t(this.lang(id));
    const type = (ctx.match as RegExpMatchArray)[1] as
      | 'BUY'
      | 'BARTER'
      | 'EITHER';

    const s = this.session.get(id)!;
    s.draft = { ...(s.draft ?? {}), type };
    s.step = 'awaiting_budget';
    this.session.set(id, s);

    return ctx.editMessageText(L.postAskBudget, {
      parse_mode: 'Markdown',
      ...kb.postBudgetPicker(),
    });
  }

  private async onPostBudgetSkip(ctx: any) {
    const id = ctx.chat.id;
    const s = this.session.get(id)!;
    s.step = undefined;
    this.session.set(id, s);
    return this.showPostConfirm(ctx, true);
  }

  private async onPostConfirm(ctx: any) {
    const id = ctx.chat.id;
    const s = this.session.get(id);
    if (!s?.jwt || !s.draft) {
      const L = t(s?.lang ?? 'en');
      return ctx.editMessageText(L.cancelled, kb.backToMenu());
    }

    try {
      const payload = {
        title: s.draft.title,
        description: s.draft.description,
        categoryId: s.draft.categoryId,
        type: s.draft.type ?? 'BUY',
        ...(s.draft.budgetMin != null && { budgetMin: s.draft.budgetMin }),
        ...(s.draft.budgetMax != null && { budgetMax: s.draft.budgetMax }),
      };
      const created = await this.api.createRequest(s.jwt, payload);
      this.session.clearStep(id);
      return ctx.editMessageText(
        t(s.lang).postSuccess(created?.id ?? '—'),
        { parse_mode: 'Markdown', ...kb.backToMenu() },
      );
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ?? e?.message ?? 'Something went wrong';
      this.log.warn(`post failed: ${msg}`);
      this.session.clearStep(id);
      return ctx.editMessageText(`❌ ${msg}`, kb.backToMenu());
    }
  }

  private showPostConfirm(ctx: any, edit: boolean) {
    const id = ctx.chat.id;
    const s = this.session.get(id)!;
    const L = t(s.lang);
    const d = s.draft ?? {};

    const text = L.postConfirm
      .replace('{cat}', this.esc(d.categoryName ?? d.categoryId ?? '—'))
      .replace('{title}', this.esc(d.title ?? '—'))
      .replace('{desc}', this.esc((d.description ?? '—').slice(0, 100)))
      .replace('{type}', d.type ?? 'BUY')
      .replace(
        '{budget}',
        d.budgetMin != null || d.budgetMax != null
          ? `${d.budgetMin ?? 0}–${d.budgetMax ?? '∞'} ETB`
          : '—',
      );

    const opts = { parse_mode: 'Markdown' as const, ...kb.postConfirm() };
    return edit ? ctx.editMessageText(text, opts) : ctx.reply(text, opts);
  }

  // ═══════════════════════════════════════════════════════
  // FREE TEXT — login + post form
  // ═══════════════════════════════════════════════════════
  private async onText(ctx: any) {
    const id = ctx.chat.id;
    const text = (ctx.message as Message.TextMessage).text.trim();
    const s = this.session.get(id);
    if (!s?.step) return;
    const L = t(s.lang);

    // ── LOGIN EMAIL ──
    if (s.step === 'awaiting_email') {
      const email = text.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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

    // ── LOGIN PASSWORD ──
    if (s.step === 'awaiting_password') {
      this.delMsg(ctx, ctx.message.message_id);
      if (text.length < 6) {
        return ctx.reply(L.badPassword, {
          reply_markup: { force_reply: true, selective: true },
        });
      }
      const email = s.pendingEmail;
      if (!email) {
        this.session.clearStep(id);
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
        return ctx.reply(
          L.loginOk(resp.user.name ?? resp.user.email ?? 'there'),
          { parse_mode: 'Markdown', ...kb.mainMenu() },
        );
      } catch (e: any) {
        this.session.clearStep(id);
        if (e?.response?.status === 401) {
          this.session.set(id, {
            lang: s.lang,
            step: 'awaiting_email',
            expiresAt: 0,
          });
          return ctx.reply(L.loginFail, {
            reply_markup: { force_reply: true, selective: true },
          });
        }
        return ctx.reply(L.cannotReachServer, kb.backToMenu());
      }
    }

    // ── POST TITLE ──
    if (s.step === 'awaiting_title') {
      if (text.length < 3) return ctx.reply('❌ Title too short.');
      s.draft = { ...(s.draft ?? {}), title: text };
      s.step = 'awaiting_desc';
      this.session.set(id, s);
      return ctx.reply(L.postAskDesc);
    }

    // ── POST DESCRIPTION ──
    if (s.step === 'awaiting_desc') {
      if (text.length < 3) return ctx.reply('❌ Description too short.');
      s.draft = { ...(s.draft ?? {}), description: text };
      s.step = undefined;
      this.session.set(id, s);
      return ctx.reply(L.postAskType, kb.postTypePicker());
    }

    // ── POST BUDGET ──
    if (s.step === 'awaiting_budget') {
      const range = text.split('-').map((x) => x.trim());
      const min = parseInt(range[0], 10);
      const max = range[1] ? parseInt(range[1], 10) : min;
      if (isNaN(min) || isNaN(max)) {
        return ctx.reply(
          '❌ Invalid. Send a number like `1000` or a range `1000-5000`.',
          { parse_mode: 'Markdown' },
        );
      }
      s.draft = { ...(s.draft ?? {}), budgetMin: min, budgetMax: max };
      s.step = undefined;
      this.session.set(id, s);
      return this.showPostConfirm(ctx, false);
    }
  }
}