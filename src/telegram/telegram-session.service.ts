import { Injectable } from '@nestjs/common';
import { Lang } from './telegram-i18n';

export interface PostDraft {
  categoryId?: string;
  categoryName?: string;
  title?: string;
  description?: string;
  type?: 'BUY' | 'BARTER' | 'EITHER';
  budgetMin?: number;
  budgetMax?: number;
}

export interface ProductDraft {
  categoryId?: string;
  categoryName?: string;
  title?: string;
  description?: string;
  condition?: 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR';
  estimatedValue?: number;
  wantedCategoryId?: string;
  wantedCategoryName?: string;
}

export interface TelegramSession {
  jwt?: string;
  userId?: string;
  userName?: string;
  lang: Lang;
  step?:
    | 'awaiting_email'
    | 'awaiting_password'
    | 'awaiting_title'
    | 'awaiting_desc'
    | 'awaiting_budget'
    | 'awaiting_reply'
    | 'awaiting_reply_location'
    | 'awaiting_product_title'
    | 'awaiting_product_desc'
    | 'awaiting_product_value';
  pendingEmail?: string;
  draft?: PostDraft;
  productDraft?: ProductDraft;
  pendingRequestId?: string;
  pendingReplyLatitude?: number;
  pendingReplyLongitude?: number;
  // browse state
  browsePage?: number;
  browseCategory?: string;
}

@Injectable()
export class TelegramSessionService {
  private store = new Map<string, TelegramSession>();
  private key(chatId: number | string) {
    return String(chatId);
  }

  get(chatId: number | string): TelegramSession | null {
    const s = this.store.get(this.key(chatId));
    return s ?? null;
  }

  set(chatId: number | string, s: TelegramSession) {
    this.store.set(this.key(chatId), s);
  }

  patch(chatId: number | string, p: Partial<TelegramSession>) {
    const cur = this.get(chatId) ?? { lang: 'en' as Lang };
    this.set(chatId, { ...cur, ...p });
  }

  clearStep(chatId: number | string) {
    const cur = this.get(chatId);
    if (!cur) return;
    delete cur.step;
    delete cur.pendingEmail;
    delete cur.draft;
    delete cur.productDraft;
    delete cur.pendingRequestId;
    delete cur.pendingReplyLatitude;
    delete cur.pendingReplyLongitude;
    this.set(chatId, cur);
  }

  destroy(chatId: number | string) {
    this.store.delete(this.key(chatId));
  }
}