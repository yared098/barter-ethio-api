import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class TelegramApiService {
  private readonly log = new Logger(TelegramApiService.name);
  private readonly http: AxiosInstance;
  private readonly botSecret: string;

  constructor(config: ConfigService) {
    let base =
      config.get<string>('API_INTERNAL_URL_telegram')?.trim() ||
      config.get<string>('API_INTERNAL_URL_tele')?.trim() ||
      'http://127.0.0.1:3000';
    base = base.replace(/^["']|["']$/g, '');

    try {
      const u = new URL(base);
      const isLocal =
        u.hostname === '127.0.0.1' ||
        u.hostname === 'localhost' ||
        u.hostname === '::1';
      if (isLocal && u.protocol === 'https:') {
        u.protocol = 'http:';
        base = u.toString().replace(/\/$/, '');
      }
    } catch { /* ignore */ }

    const prefix = base.endsWith('/api/v1') ? '' : '/api/v1';
    this.http = axios.create({
      baseURL: `${base}${prefix}`,
      timeout: 15_000,
      proxy: false,
    });
    this.botSecret = config.get<string>('TELEGRAM_INTERNAL_SECRET') ?? '';
    this.log.log(
      `Telegram API client → ${base}${prefix} | secretLen=${this.botSecret.length}`,
    );
  }

  private H() {
    return { headers: { 'x-bot-secret': this.botSecret } };
  }

  async telegramLookup(telegramId: string) {
    const { data } = await this.http.post(
      '/auth/telegram',
      { telegramId },
      this.H(),
    );
    return data as { accessToken: string; user: any };
  }

  async telegramLink(p: {
    email: string;
    password: string;
    telegramId: string;
    telegramUsername?: string;
  }) {
    const { data } = await this.http.post('/auth/telegram/link', p, this.H());
    return data as { accessToken: string; user: any };
  }

  async listRequests(
    token: string,
    page = 1,
    limit = 5,
    categoryId?: string,
  ) {
    const { data } = await this.http.get('/requests', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        scope: 'all',
        page,
        limit,
        ...(categoryId ? { categoryId } : {}),
      },
    });
    return data as { items: any[]; pagination: any };
  }

  async getRequest(token: string, id: string) {
    const { data } = await this.http.get(`/requests/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  }

  async categories() {
    const { data } = await this.http.get('/categories');
    return data as { id: string; name: string; icon?: string; slug: string }[];
  }

  async matches(token: string) {
    const { data } = await this.http.get('/matches', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  }

  async me(token: string) {
    const { data } = await this.http.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  }

  async postingStatus(token: string) {
    const { data } = await this.http.get('/users/me/posting-status', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  }

  async createRequest(token: string, payload: any) {
    const { data } = await this.http.post('/requests', payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  }
}