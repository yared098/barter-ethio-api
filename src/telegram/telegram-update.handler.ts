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
    bot.command('link', (ctx) => {
      const text = 'text' in ctx.message ? ctx.message.text : '';
      const code = text.trim().split(/\s+/)[1] ?? '';
      return this.onTelegramLink(ctx, code);
    });
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
    bot.action(/^menu:product$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onProduct(ctx, true);
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
    bot.action(/^request:reply:(.+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const session = this.session.get(ctx.chat!.id);
      if (!session?.jwt) return this.onStart(ctx);
      const requestId = (ctx.match as RegExpMatchArray)[1];
      try {
        const request = await this.api.getRequest(session.jwt, requestId);
        const needsLocation =
          request.latitude != null && request.longitude != null;
        this.session.patch(ctx.chat!.id, {
          step: needsLocation ? 'awaiting_reply_location' : 'awaiting_reply',
          pendingRequestId: requestId,
          pendingReplyLatitude: undefined,
          pendingReplyLongitude: undefined,
        });
        if (needsLocation) {
          return ctx.reply(
            '📍 This request is location-limited. Share your location to continue.',
            kb.requestLocation(),
          );
        }
      } catch (e) {
        this.log.warn(`request lookup before reply failed: ${(e as Error).message}`);
        return ctx.reply(t(this.lang(ctx.chat!.id)).cannotReachServer);
      }
      return ctx.reply('💬 Type your reply to this request:');
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

    bot.action(/^product:cat:(.+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onProductCategory(ctx);
    });
    bot.action(/^product:condition:(NEW|LIKE_NEW|GOOD|FAIR)$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onProductCondition(ctx);
    });
    bot.action(/^product:wanted:(.+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const categoryId = (ctx.match as RegExpMatchArray)[1];
      const categories = await this.getCategories();
      const category = categories.find((item) => item.id === categoryId);
      const s = this.session.get(ctx.chat!.id);
      if (!s?.productDraft || !category) {
        return ctx.reply('❌ Product draft or category was lost. Start again from the menu.');
      }
      s.productDraft.wantedCategoryId = categoryId;
      s.productDraft.wantedCategoryName = category.name;
      this.session.set(ctx.chat!.id, s);
      return this.showProductConfirm(ctx, true);
    });
    bot.action(/^product:confirm$/, async (ctx) => {
      await ctx.answerCbQuery();
      return this.onProductConfirm(ctx);
    });
    bot.action(/^product:cancel$/, async (ctx) => {
      await ctx.answerCbQuery();
      this.session.clearStep(ctx.chat!.id);
      return this.showHome(ctx, true);
    });

    // free text
    bot.on('location', (ctx) => this.onReplyLocation(ctx));
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
    if (s?.jwt && this.isAccessTokenFresh(s.jwt)) return true;

    const inflight = this.loginInFlight.get(key);
    if (inflight) return inflight;

    const promise = (async (): Promise<boolean> => {
      try {
        const resp = await this.api.telegramLookup(String(from.id));
        this.session.set(chatId, {
          ...s,
          lang: s?.lang ?? 'en',
          jwt: resp.accessToken,
          userId: resp.user.id,
          userName:
            resp.user.name ?? resp.user.email ?? from.username ?? 'User',
        });
        return true;
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 401) {
          this.session.set(chatId, { lang: s?.lang ?? 'en' });
        } else {
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

  private isAccessTokenFresh(token: string): boolean {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
      ) as { exp?: unknown };
      return (
        typeof payload.exp === 'number' &&
        payload.exp * 1000 > Date.now() + 30_000
      );
    } catch {
      return false;
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

    if (s?.jwt) return this.showHome(ctx, false);

    this.session.set(id, { lang: s?.lang ?? 'en' });
    return ctx.reply(
      'To use your existing Barter Ethio account here, sign in on the website, generate a Telegram link code from your dashboard, then send `/link CODE` in this chat. The code expires after 10 minutes and can only be used once.',
      { parse_mode: 'Markdown' },
    );
  }

  private async onTelegramLink(ctx: any, code: string) {
    if (ctx.chat?.type !== 'private' || !ctx.from) {
      return ctx.reply('Account linking is available in a private chat with this bot.');
    }
    if (!/^[A-Fa-f0-9]{16}$/.test(code)) {
      return ctx.reply('Use the command `/link CODE` with the one-time code from your Barter Ethio dashboard.', {
        parse_mode: 'Markdown',
      });
    }

    try {
      const result = await this.api.completeTelegramLink({
        code: code.toUpperCase(),
        telegramId: String(ctx.from.id),
        telegramUsername: ctx.from.username,
      });
      const previous = this.session.get(ctx.chat.id);
      this.session.set(ctx.chat.id, {
        lang: previous?.lang ?? 'en',
        jwt: result.accessToken,
        userId: result.user.id,
        userName:
          result.user.name ?? result.user.email ?? ctx.from.username ?? 'User',
      });
      return ctx.reply(
        'Your Telegram account is now linked to Barter Ethio. Chat notifications can open the conversation directly. Use /start to continue.',
        kb.mainMenu(),
      );
    } catch (error: any) {
      const status = error?.response?.status;
      this.log.warn(`Telegram account linking failed: ${(error as Error).message}`);
      if (status === 401 || status === 409) {
        return ctx.reply(
          'This code is invalid, expired, already used, or belongs to an account linked to another Telegram user. Generate a new code from your dashboard and try again.',
        );
      }
      return ctx.reply('Could not link your account right now. Please try again later.');
    }
  }

  private async onHelp(ctx: any) {
    const id = ctx.chat.id;
    return ctx.reply(
      '*Commands*\n' +
        '/start — main menu\n' +
        '/browse — wanted board\n' +
        '/post — post a request\n' +
        'Use “Post product” in the menu to list a product.\n' +
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
        items.map((item: any) => ({ id: item.id, title: item.title ?? '' })),
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
          r.canRespond === true,
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

  private async onProduct(ctx: any, edit = false) {
    const id = ctx.chat.id;
    const s = this.session.get(id);
    if (!s?.jwt) return this.onStart(ctx);

    try {
      const cats = await this.getCategories();
      this.session.patch(id, {
        step: undefined,
        draft: undefined,
        productDraft: {},
        pendingRequestId: undefined,
      });
      const opts = {
        parse_mode: 'Markdown' as const,
        ...kb.productCategoryPicker(cats, 'product:cat'),
      };
      return edit
        ? ctx.editMessageText('📂 Choose your product category:', opts)
        : ctx.reply('📂 Choose your product category:', opts);
    } catch (e) {
      this.log.warn(`product category load failed: ${(e as Error).message}`);
      return ctx.reply(t(this.lang(id)).cannotReachServer, kb.backToMenu());
    }
  }

  private async onProductCategory(ctx: any) {
    const id = ctx.chat.id;
    const categoryId = (ctx.match as RegExpMatchArray)[1];
    const cats = await this.getCategories();
    const category = cats.find((item) => item.id === categoryId);
    if (!category) return ctx.reply('❌ Category not found. Start again.');

    const s = this.session.get(id);
    if (!s?.jwt) return this.onStart(ctx);
    this.session.set(id, {
      ...s,
      step: 'awaiting_product_title',
      productDraft: { categoryId, categoryName: category.name },
    });
    return ctx.editMessageText('📝 Type your product title (3–120 characters):');
  }

  private async onProductCondition(ctx: any) {
    const id = ctx.chat.id;
    const s = this.session.get(id);
    if (!s?.productDraft) return ctx.reply('❌ Product draft was lost. Start again from the menu.');

    const condition = (ctx.match as RegExpMatchArray)[1] as
      | 'NEW'
      | 'LIKE_NEW'
      | 'GOOD'
      | 'FAIR';
    s.productDraft.condition = condition;
    s.step = 'awaiting_product_value';
    this.session.set(id, s);
    return ctx.reply('💰 Enter the estimated value in ETB (0–1,000,000):');
  }

  private async onProductConfirm(ctx: any) {
    const id = ctx.chat.id;
    const s = this.session.get(id);
    const draft = s?.productDraft;
    if (
      !s?.jwt ||
      !draft?.categoryId ||
      !draft.title ||
      !draft.description ||
      !draft.condition ||
      draft.estimatedValue == null ||
      !draft.wantedCategoryId
    ) {
      this.session.clearStep(id);
      return ctx.editMessageText('❌ Product draft is incomplete. Start again.', kb.backToMenu());
    }

    try {
      const created = await this.api.createProduct(s.jwt, {
        title: draft.title,
        description: draft.description,
        categoryId: draft.categoryId,
        condition: draft.condition,
        estimatedValue: draft.estimatedValue,
        wants: [{ categoryId: draft.wantedCategoryId }],
      });
      this.session.clearStep(id);
      return ctx.editMessageText(
        `🎉 Product posted! ID: ${this.esc(created?.id ?? '—')}`,
        { parse_mode: 'HTML', ...kb.backToMenu() },
      );
    } catch (e: any) {
      const message = e?.response?.data?.message ?? e?.message ?? 'Could not post product';
      this.log.warn(`product post failed: ${message}`);
      this.session.clearStep(id);
      return ctx.editMessageText(`❌ ${this.esc(Array.isArray(message) ? message.join(', ') : message)}`, {
        parse_mode: 'HTML',
        ...kb.backToMenu(),
      });
    }
  }

  private showProductConfirm(ctx: any, edit: boolean) {
    const id = ctx.chat.id;
    const s = this.session.get(id);
    const draft = s?.productDraft;
    if (!draft) return ctx.reply('❌ Product draft was lost. Start again.');

    const text =
      `✅ <b>Confirm product</b>\n\n` +
      `📂 Category: ${this.esc(draft.categoryName ?? '—')}\n` +
      `📝 Title: ${this.esc(draft.title ?? '—')}\n` +
      `📄 ${this.esc(draft.description ?? '—')}\n` +
      `🔎 Condition: ${draft.condition ?? '—'}\n` +
      `💰 Estimated value: ${draft.estimatedValue ?? '—'} ETB\n` +
      `🔄 Wants: ${this.esc(draft.wantedCategoryName ?? '—')}`;
    const opts = { parse_mode: 'HTML' as const, ...kb.productConfirm() };
    return edit ? ctx.editMessageText(text, opts) : ctx.reply(text, opts);
  }

  private async onPostCategory(ctx: any) {
    const id = ctx.chat.id;
    const L = t(this.lang(id));
    const categoryId = (ctx.match as RegExpMatchArray)[1];
    const cats = await this.getCategories();
    const cat = cats.find((c) => c.id === categoryId);

    const s = this.session.get(id) ?? { lang: 'en' as Lang };
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
          });
          return ctx.reply(L.loginFail, {
            reply_markup: { force_reply: true, selective: true },
          });
        }
        return ctx.reply(L.cannotReachServer, kb.backToMenu());
      }
    }

    if (s.step === 'awaiting_reply') {
      if (!text || !s.pendingRequestId || !s.jwt) {
        this.session.clearStep(id);
        return ctx.reply('❌ Reply could not be sent. Please open the request and try again.');
      }
      try {
        await this.api.replyRequest(s.jwt, s.pendingRequestId, {
          message: text,
          ...(s.pendingReplyLatitude != null &&
            s.pendingReplyLongitude != null && {
              viewerLat: s.pendingReplyLatitude,
              viewerLng: s.pendingReplyLongitude,
            }),
        });
        this.session.clearStep(id);
        return ctx.reply('✅ Your reply was sent.', kb.backToMenu());
      } catch (e: any) {
        const message = e?.response?.data?.message ?? e?.message ?? 'Could not send reply';
        this.log.warn(`request reply failed: ${message}`);
        this.session.clearStep(id);
        return ctx.reply(
          `❌ ${this.esc(Array.isArray(message) ? message.join(', ') : message)}`,
          { parse_mode: 'HTML', ...kb.backToMenu() },
        );
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

    if (s.step === 'awaiting_product_title') {
      if (text.length < 3 || text.length > 120) {
        return ctx.reply('❌ Title must be between 3 and 120 characters.');
      }
      s.productDraft = { ...(s.productDraft ?? {}), title: text };
      s.step = 'awaiting_product_desc';
      this.session.set(id, s);
      return ctx.reply('📝 Type a product description (10–2,000 characters):');
    }

    if (s.step === 'awaiting_product_desc') {
      if (text.length < 10 || text.length > 2000) {
        return ctx.reply('❌ Description must be between 10 and 2,000 characters.');
      }
      s.productDraft = { ...(s.productDraft ?? {}), description: text };
      s.step = undefined;
      this.session.set(id, s);
      return ctx.reply('🔎 Choose the product condition:', kb.productConditionPicker());
    }

    if (s.step === 'awaiting_product_value') {
      const value = Number(text);
      if (!text || !Number.isFinite(value) || value < 0 || value > 1_000_000) {
        return ctx.reply('❌ Enter a number between 0 and 1,000,000 ETB.');
      }
      s.productDraft = { ...(s.productDraft ?? {}), estimatedValue: value };
      s.step = undefined;
      this.session.set(id, s);

      const cats = await this.getCategories();
      return ctx.reply(
        '🔄 Choose the category you want in exchange:',
        kb.productCategoryPicker(cats, 'product:wanted'),
      );
    }
  }

  private async onReplyLocation(ctx: any) {
    const id = ctx.chat.id;
    const session = this.session.get(id);
    const location = ctx.message.location;
    if (session?.step !== 'awaiting_reply_location' || !location) return;

    this.session.patch(id, {
      step: 'awaiting_reply',
      pendingReplyLatitude: location.latitude,
      pendingReplyLongitude: location.longitude,
    });
    return ctx.reply('💬 Type your reply to this request.', {
      reply_markup: { remove_keyboard: true },
    });
  }
}