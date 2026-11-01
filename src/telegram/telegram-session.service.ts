import { Injectable } from '@nestjs/common';
import { Lang } from './telegram-i18n';

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — persistent for bot

export interface TelegramSession {
  jwt?: string;
  userId?: string;
  userName?: string;
  lang: Lang;
  step?: 'awaiting_email' | 'awaiting_password';
  pendingEmail?: string;
  expiresAt: number;
}

@Injectable()
export class TelegramSessionService {
  private store = new Map<string, TelegramSession>();

  private key(chatId: number | string) {
    return String(chatId);
  }

  get(chatId: number | string): TelegramSession | null {
    const s = this.store.get(this.key(chatId));
    if (!s) return null;
    if (s.expiresAt < Date.now()) {
      this.store.delete(this.key(chatId));
      return null;
    }
    return s;
  }

  set(chatId: number | string, s: TelegramSession) {
    this.store.set(this.key(chatId), { ...s, expiresAt: Date.now() + TTL_MS });
  }

  patch(chatId: number | string, p: Partial<TelegramSession>) {
    const cur = this.get(chatId) ?? { lang: 'en' as Lang, expiresAt: 0 };
    this.set(chatId, { ...cur, ...p });
  }

  clearLogin(chatId: number | string) {
    const cur = this.get(chatId);
    if (!cur) return;
    delete cur.step;
    delete cur.pendingEmail;
    this.set(chatId, cur);
  }

  destroy(chatId: number | string) {
    this.store.delete(this.key(chatId));
  }
}