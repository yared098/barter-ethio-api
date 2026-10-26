import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      this.logger.warn('⚠️  REDIS_URL not set — cache and distributed throttling disabled');
      return;
    }

    try {
      this.client = new Redis(url, {
        lazyConnect: false,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy: (times) => Math.min(times * 200, 3000),
      });

      this.client.on('connect', () => {
        this.logger.log(`✅ Redis connected: ${url.split('@').pop()}`);
      });

      this.client.on('error', (err) => {
        this.logger.error(`Redis error: ${err.message}`);
      });

      this.client.on('reconnecting', () => {
        this.logger.warn('Redis reconnecting...');
      });
    } catch (err) {
      this.logger.error(
        `❌ Redis init failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
      this.logger.log('Redis connection closed');
    }
  }

  get isReady(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }

  getClient(): Redis | null {
    return this.client;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isReady || !this.client) return null;
    try {
      const raw = await this.client.get(this.k(key));
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(`Cache GET failed for ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.isReady || !this.client) return;
    try {
      const ttl = ttlSeconds ?? Number(this.config.get('CACHE_TTL_SECONDS') ?? 60);
      await this.client.set(this.k(key), JSON.stringify(value), 'EX', ttl);
    } catch (err) {
      this.logger.warn(`Cache SET failed for ${key}: ${(err as Error).message}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.isReady || !this.client || keys.length === 0) return;
    try {
      await this.client.del(...keys.map((k) => this.k(k)));
    } catch (err) {
      this.logger.warn(`Cache DEL failed: ${(err as Error).message}`);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    if (!this.isReady || !this.client) return;
    try {
      const prefixed = `${this.prefix()}${pattern}`;
      const keys = await this.client.keys(prefixed);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (err) {
      this.logger.warn(`Cache DEL pattern failed: ${(err as Error).message}`);
    }
  }

  async remember<T>(
    key: string,
    ttlSeconds: number | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await fn();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  private k(key: string): string {
    return `${this.prefix()}${key}`;
  }

  private prefix(): string {
    return this.config.get<string>('REDIS_PREFIX') ?? 'barter:';
  }
}
