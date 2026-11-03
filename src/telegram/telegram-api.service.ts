import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';

// ⭐ HARDCODED loopback — this service uses Node's raw http module,
//    which CANNOT do TLS. EPROTO is impossible.
const BASE_HOST = '127.0.0.1';
const BASE_PORT = 3000;
const BASE_PATH = '/api/v1';

@Injectable()
export class TelegramApiService {
  private readonly log = new Logger(TelegramApiService.name);
  private readonly botSecret: string;

  constructor(config: ConfigService) {
    this.botSecret = config.get<string>('TELEGRAM_INTERNAL_SECRET') ?? '';
    this.log.log(
      `Telegram API client → http://${BASE_HOST}:${BASE_PORT}${BASE_PATH} | secretLen=${this.botSecret.length} | transport=node:http`,
    );
    if (this.botSecret.length !== 64) {
      this.log.error(
        `⚠️ TELEGRAM_INTERNAL_SECRET wrong length (${this.botSecret.length}, expected 64)`,
      );
    }
  }

  private request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: any,
    authToken?: string,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-bot-secret': this.botSecret,
      };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const payload = body != null ? JSON.stringify(body) : undefined;
      if (payload) headers['Content-Length'] = String(Buffer.byteLength(payload));

      const req = http.request(
        {
          host: BASE_HOST,
          port: BASE_PORT,
          path: `${BASE_PATH}${path}`,
          method,
          headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            const status = res.statusCode ?? 0;
            let parsed: any = {};
            try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = text; }

            if (status >= 200 && status < 300) {
              resolve(parsed as T);
            } else {
              const err: any = new Error(
                `HTTP ${status}: ${parsed?.message ?? text ?? 'error'}`,
              );
              err.response = { status, data: parsed };
              reject(err);
            }
          });
        },
      );
      req.on('error', (e) => reject(e));
      req.setTimeout(15_000, () => {
        req.destroy(new Error('timeout'));
      });
      if (payload) req.write(payload);
      req.end();
    });
  }

  telegramLookup(telegramId: string) {
    return this.request<{ accessToken: string; user: any }>(
      'POST',
      '/auth/telegram',
      { telegramId },
    );
  }

  telegramLink(p: {
    email: string;
    password: string;
    telegramId: string;
    telegramUsername?: string;
  }) {
    return this.request<{ accessToken: string; user: any }>(
      'POST',
      '/auth/telegram/link',
      p,
    );
  }

  listRequests(token?: string, page = 1, limit = 5, categoryId?: string) {
    const qs = new URLSearchParams({
      scope: 'all',
      page: String(page),
      limit: String(limit),
      ...(categoryId ? { categoryId } : {}),
    });
    return this.request<{ items: any[]; pagination: any }>(
      'GET',
      `/requests?${qs.toString()}`,
      undefined,
      token,
    );
  }

  getRequest(token: string, id: string) {
    return this.request<any>('GET', `/requests/${id}`, undefined, token);
  }

  categories() {
    return this.request<{ id: string; name: string; icon?: string; slug: string }[]>(
      'GET',
      '/categories',
    );
  }

  matches(token: string) {
    return this.request<any>('GET', '/matches', undefined, token);
  }

  me(token: string) {
    return this.request<any>('GET', '/auth/me', undefined, token);
  }

  postingStatus(token: string) {
    return this.request<any>('GET', '/users/me/posting-status', undefined, token);
  }

  createRequest(token: string, payload: any) {
    return this.request<any>('POST', '/requests', payload, token);
  }

  replyRequest(
    token: string,
    requestId: string,
    payload: { message: string; viewerLat?: number; viewerLng?: number },
  ) {
    return this.request<any>(
      'POST',
      `/requests/${encodeURIComponent(requestId)}/replies`,
      payload,
      token,
    );
  }

  createProduct(token: string, payload: any) {
    return this.request<any>('POST', '/products', payload, token);
  }
}