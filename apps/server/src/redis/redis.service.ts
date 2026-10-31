import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379';
    this.client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false });
  }

  get raw(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, value, 'EX', ttlSeconds);
      return;
    }
    await this.client.set(key, value);
  }

  /** 自增；若 key 新建则设置 TTL（秒） */
  async incr(key: string, ttlSecondsWhenCreate?: number): Promise<number> {
    const n = await this.client.incr(key);
    if (n === 1 && ttlSecondsWhenCreate && ttlSecondsWhenCreate > 0) {
      await this.client.expire(key, ttlSecondsWhenCreate);
    }
    return n;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds > 0) await this.client.expire(key, ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.del(...keys);
  }

  /** SET key NX EX — 成功返回 true */
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const r = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return r === 'OK';
  }

  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
