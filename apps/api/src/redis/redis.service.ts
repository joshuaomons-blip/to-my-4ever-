import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, AppConfig } from '../config/config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: Redis;
  private readonly logger = new Logger('Redis');

  constructor(@Inject(APP_CONFIG) cfg: AppConfig) {
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
