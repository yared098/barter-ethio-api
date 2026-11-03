import { Markup } from 'telegraf';

type IK = ReturnType<typeof Markup.inlineKeyboard>;

export const kb = {
  // ── main menu ─────────────────────────────────────────────
  mainMenu: (): IK =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback('📋 Browse', 'menu:browse'),
        Markup.button.callback('📝 Post', 'menu:post'),
      ],
      [Markup.button.callback('📦 Post product', 'menu:product')],
      [
        Markup.button.callback('🎯 Matches', 'menu:matches'),
        Markup.button.callback('👤 Me', 'menu:me'),
      ],
      [Markup.button.callback('🌐 Language', 'menu:lang')],
    ]),

  // ── browse ────────────────────────────────────────────────
  browseMenu: (
    page: number,
    hasMore: boolean,
    categoryId?: string,
    requests: { id: string; title: string }[] = [],
  ): IK => {
    const rows: ReturnType<typeof Markup.button.callback>[][] = [];

    // pager row
    const pager: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 1)
      pager.push(
        Markup.button.callback('◀ Prev', `browse:${page}:${categoryId ?? ''}`),
      );
    if (hasMore)
      pager.push(
        Markup.button.callback(
          'Next ▶',
          `browse:${page + 1}:${categoryId ?? ''}`,
        ),
      );
    if (pager.length) rows.push(pager);

    for (const [index, request] of requests.entries()) {
      const title = request.title.length > 28
        ? `${request.title.slice(0, 27)}…`
        : request.title;
      rows.push([
        Markup.button.callback(
          `📄 ${index + 1}. ${title || 'View request'}`,
          `detail:${request.id}`,
        ),
      ]);
    }

    // action row
    rows.push([
      Markup.button.callback('📂 Filter', 'browse:filter'),
      Markup.button.callback('🔄 Refresh', `browse:1:${categoryId ?? ''}`),
    ]);

    rows.push([Markup.button.callback('↩ Back', 'menu:home')]);
    return Markup.inlineKeyboard(rows);
  },

  categoryPicker: (
    cats: { id: string; name: string; icon?: string }[],
    showAll = true,
  ): IK => {
    const rows = cats.map((c) => [
      Markup.button.callback(
        `${c.icon ?? ''} ${c.name}`.trim(),
        `browse:cat:${c.id}`,
      ),
    ]);
    if (showAll)
      rows.unshift([
        Markup.button.callback('🌍 All categories', 'browse:cat:all'),
      ]);
    rows.push([Markup.button.callback('↩ Back', 'menu:browse')]);
    return Markup.inlineKeyboard(rows);
  },

  requestDetail: (
    requestId: string,
    backToPage: number,
    categoryId = '',
    canReply = false,
  ): IK =>
    Markup.inlineKeyboard([
      ...(canReply
        ? [[Markup.button.callback('💬 Reply to request', `request:reply:${requestId}`)]]
        : []),
      [
        Markup.button.callback('🔄 Refresh', `detail:${requestId}`),
        Markup.button.callback(
          '↩ Back to list',
          `browse:${backToPage}:${categoryId}`,
        ),
      ],
    ]),

  // ── post flow ─────────────────────────────────────────────
  postCategoryPicker: (
    cats: { id: string; name: string; icon?: string }[],
  ): IK => {
    const rows = cats.map((c) => [
      Markup.button.callback(
        `${c.icon ?? ''} ${c.name}`.trim(),
        `post:cat:${c.id}`,
      ),
    ]);
    rows.push([Markup.button.callback('❌ Cancel', 'post:cancel')]);
    return Markup.inlineKeyboard(rows);
  },

  productCategoryPicker: (
    cats: { id: string; name: string; icon?: string }[],
    callbackPrefix: 'product:cat' | 'product:wanted',
  ): IK => {
    const rows = cats.map((c) => [
      Markup.button.callback(
        `${c.icon ?? ''} ${c.name}`.trim(),
        `${callbackPrefix}:${c.id}`,
      ),
    ]);
    rows.push([Markup.button.callback('❌ Cancel', 'product:cancel')]);
    return Markup.inlineKeyboard(rows);
  },

  productConditionPicker: (): IK =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback('New', 'product:condition:NEW'),
        Markup.button.callback('Like new', 'product:condition:LIKE_NEW'),
      ],
      [
        Markup.button.callback('Good', 'product:condition:GOOD'),
        Markup.button.callback('Fair', 'product:condition:FAIR'),
      ],
      [Markup.button.callback('❌ Cancel', 'product:cancel')],
    ]),

  productConfirm: (): IK =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Post product', 'product:confirm'),
        Markup.button.callback('❌ Cancel', 'product:cancel'),
      ],
    ]),

  requestLocation: () =>
    Markup.keyboard([
      [Markup.button.locationRequest('📍 Share my location')],
    ])
      .oneTime()
      .resize(),

  postTypePicker: (): IK =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback('💵 Buy (cash)', 'post:type:BUY'),
        Markup.button.callback('🔄 Barter', 'post:type:BARTER'),
      ],
      [Markup.button.callback('🔀 Either', 'post:type:EITHER')],
      [Markup.button.callback('❌ Cancel', 'post:cancel')],
    ]),

  postBudgetPicker: (): IK =>
    Markup.inlineKeyboard([
      [Markup.button.callback('⏭ Skip budget', 'post:budget:skip')],
      [Markup.button.callback('❌ Cancel', 'post:cancel')],
    ]),

  postConfirm: (): IK =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Post it', 'post:confirm'),
        Markup.button.callback('❌ Cancel', 'post:cancel'),
      ],
    ]),

  // ── misc ──────────────────────────────────────────────────
  backToMenu: (): IK =>
    Markup.inlineKeyboard([
      [Markup.button.callback('🏠 Main menu', 'menu:home')],
    ]),

  langPicker: (): IK =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback('🇬🇧 English', 'lang:en'),
        Markup.button.callback('🇪🇹 አማርኛ', 'lang:am'),
      ],
      [Markup.button.callback('↩ Back', 'menu:home')],
    ]),
};