import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, AppConfig } from '../config/config';
import { MemoryKv } from './memory-kv';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: Redis;
  private readonly logger = new Logger('Redis');

  constructor(@Inject(APP_CONFIG) cfg: AppConfig) {
    if (cfg.redisUrl === 'memory') {
      // Sandbox-only in-process store (see memory-kv.ts); the config loader refuses it outside sandbox mode.
      this.client = new MemoryKv() as unknown as Redis;
      return;
    }
    this.client = new Redis(cfg.redisUrl, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: true });
    this.client.on('error', (e) => this.logger.warn(`redis error: ${e.message}`));
  }

  /** Connect at boot; if Redis is down the app still starts (sensitive routes then fail closed). */
  async onModuleInit(): Promise<void> {
    await this.client.connect().catch((e) => this.logger.error(`redis unavailable at startup: ${(e as Error).message}`));
  }

  get healthy(): boolean {
    return this.client.status === 'ready';
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}
