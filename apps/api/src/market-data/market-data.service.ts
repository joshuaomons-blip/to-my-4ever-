import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config';
import { RedisService } from '../redis/redis.service';
import { AppError } from '../common/errors';
import { BarRange, MARKET_DATA_ADAPTER, MarketDataAdapter, Quote } from './market-data.adapter';

export interface QuoteWithFreshness extends Quote {
  ageSeconds: number;
  stale: boolean;
}

@Injectable()
export class MarketDataService {
  constructor(
    @Inject(MARKET_DATA_ADAPTER) private readonly adapter: MarketDataAdapter,
    private readonly redis: RedisService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  /** Short Redis cache (2s) in front of the provider; freshness is always computed from the source timestamp. */
  async quote(symbol: string): Promise<QuoteWithFreshness> {
    const key = `md:q:${symbol}`;
    let q: Quote | null = null;
    try {
      const cached = await this.redis.client.get(key);
      if (cached) q = JSON.parse(cached) as Quote;
    } catch {
      /* cache miss on redis failure */
    }
    if (!q) {
      try {
        q = await this.adapter.getQuote(symbol);
      } catch (e) {
        throw new AppError('MARKET_DATA_UNAVAILABLE', 'Market data is temporarily unavailable', 503, { cause: (e as Error).message });
      }
      this.redis.client.set(key, JSON.stringify(q), 'EX', 2).catch(() => undefined);
    }
    const ageSeconds = Math.max(0, Math.round((Date.now() - Date.parse(q.asOf)) / 1000));
    return { ...q, ageSeconds, stale: ageSeconds > this.cfg.quoteStaleAfterSeconds };
  }

  async bars(symbol: string, range: BarRange) {
    const key = `md:b:${symbol}:${range}`;
    try {
      const cached = await this.redis.client.get(key);
      if (cached) return JSON.parse(cached);
    } catch {
      /* ignore */
    }
    const bars = await this.adapter.getBars(symbol, range);
    const out = { symbol, range, source: this.adapter.name, simulated: this.adapter.name === 'sandbox', bars };
    this.redis.client.set(key, JSON.stringify(out), 'EX', 30).catch(() => undefined);
    return out;
  }
}
