import { Markup } from 'telegraf';

type IK = ReturnType<typeof Markup.inlineKeyboard>;

export const kb = {
  mainMenu: (): IK =>
    Markup.inlineKeyboard([
      [Markup.button.callback('📋 Browse', 'menu:browse')],
      [Markup.button.callback('🔄 Refresh', 'menu:refresh')],
    ]),

  browsePager: (page: number, hasMore: boolean): IK | undefined => {
    const row: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 1)
      row.push(Markup.button.callback('◀ Prev', `browse:${page - 1}`));
    if (hasMore)
      row.push(Markup.button.callback('Next ▶', `browse:${page + 1}`));
    return row.length ? Markup.inlineKeyboard([row]) : undefined;
  },

  browseWithMenu: (page: number, hasMore: boolean): IK => {
    const rows: ReturnType<typeof Markup.button.callback>[][] = [];
    const pagerRow: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 1)
      pagerRow.push(Markup.button.callback('◀ Prev', `browse:${page - 1}`));
    if (hasMore)
      pagerRow.push(Markup.button.callback('Next ▶', `browse:${page + 1}`));
    if (pagerRow.length) rows.push(pagerRow);
    rows.push([Markup.button.callback('🔄 Refresh', 'menu:refresh')]);
    return Markup.inlineKeyboard(rows);
  },
};