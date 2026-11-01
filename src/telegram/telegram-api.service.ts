import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class TelegramApiService {
  private readonly log = new Logger(TelegramApiService.name);
  private readonly http: AxiosInstance;
  private readonly botSecret: string;

  constructor(config: ConfigService) {
    const base =
      config.get<string>('API_INTERNAL_URL') ??
      config.get<string>('API_PUBLIC_URL') ??
      'http://127.0.0.1:3000';
    const prefix = base.endsWith('/api/v1') ? '' : '/api/v1';
    this.http = axios.create({
      baseURL: `${base}${prefix}`,
      timeout: 15_000,
    });
    this.botSecret = config.get<string>('TELEGRAM_INTERNAL_SECRET') ?? '';
    if (!this.botSecret) {
      this.log.warn(
        'TELEGRAM_INTERNAL_SECRET missing — bot-to-API auth will fail',
      );
    }
    this.log.log(`Telegram API client → ${base}${prefix}`);
  }

  /** Lookup by telegram ID only — used on every message. */
  async telegramLookup(telegramId: string) {
    const { data } = await this.http.post(
      '/auth/telegram',
      { telegramId },
      { headers: { 'x-bot-secret': this.botSecret } },
    );
    return data as { accessToken: string; refreshToken: string; user: any };
  }

  /** First-time: verify password + link telegram to that user. */
  async telegramLink(p: {
    email: string;
    password: string;
    telegramId: string;
    telegramUsername?: string;
  }) {
    const { data } = await this.http.post(
      '/auth/telegram/link',
      p,
      { headers: { 'x-bot-secret': this.botSecret } },
    );
    return data as { accessToken: string; refreshToken: string; user: any };
  }

  async listRequests(
    token: string,
    page = 1,
    limit = 5,
  ) {
    const { data } = await this.http.get('/requests', {
      headers: { Authorization: `Bearer ${token}` },
      params: { scope: 'all', page, limit },
    });
    return data as { items: any[]; pagination: any };
  }
}