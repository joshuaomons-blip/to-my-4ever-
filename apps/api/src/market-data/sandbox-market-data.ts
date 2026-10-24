import { Injectable } from '@nestjs/common';
import { Decimal } from '../common/money';
import { RedisService } from '../redis/redis.service';
import { Bar, BarRange, MarketDataAdapter, Quote } from './market-data.adapter';

/**
 * SANDBOX market data: deterministic simulated prices (identical across processes for a given time),
 * so orders, previews and charts agree. Every quote is flagged simulated=true. Never use for real trading.
 *
 * Test hook: Redis key `sandbox:md:stale:<SYMBOL>` = <seconds> shifts the quote timestamp into the past.
 */
export const SANDBOX_BASE_PRICES: Record<string, number> = {
  AAPL: 228, MSFT: 432, NVDA: 138, AMZN: 196, GOOGL: 171, META: 585, TSLA: 251, JPM: 224, V: 288, JNJ: 158,
  KO: 68, XOM: 117, BRK_B: 461, SPY: 578, VOO: 531, QQQ: 495, VTI: 286, IWM: 221, VEA: 52, AGG: 99, GLD: 247,
  VWO: 46, SCHD: 28, ARKK: 52, BND: 73,
};

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Smooth deterministic price path: incommensurate sinusoids with amplitude falling with period (so daily
 * or weekly sampling never aliases into a sawtooth), plus a tiny per-minute jitter for live-looking quotes.
 */
export function sandboxPrice(symbol: string, atMs: number): number {
  const base = SANDBOX_BASE_PRICES[symbol.replace('.', '_')] ?? 50 + (hash32(symbol) % 200);
  const seed = hash32(symbol);
  const phase = (k: number) => (((seed >>> (k * 5)) % 997) / 997) * Math.PI * 2;
  const days = atMs / 86_400_000;
  const drift =
    0.11 * Math.sin(days / 120 + phase(0)) +
    0.045 * Math.sin(days / 31 + phase(1)) +
    0.016 * Math.sin(days / 7.3 + phase(2)) +
    0.005 * Math.sin(days / 1.9 + phase(3)) +
    0.0025 * Math.sin((atMs / 60_000) / 37 + phase(4));
  const minute = Math.floor(atMs / 60_000);
  const jitter = ((hash32(`${symbol}:${minute}`) % 1000) / 1000 - 0.5) * 0.0012;
  return Math.max(1, base * (1 + drift + jitter));
}

const RANGE: Record<BarRange, { spanMs: number; stepMs: number }> = {
  '1D': { spanMs: 86_400_000, stepMs: 5 * 60_000 },
  '1W': { spanMs: 7 * 86_400_000, stepMs: 60 * 60_000 },
  '1M': { spanMs: 30 * 86_400_000, stepMs: 4 * 3_600_000 },
  '3M': { spanMs: 91 * 86_400_000, stepMs: 86_400_000 },
  '1Y': { spanMs: 365 * 86_400_000, stepMs: 86_400_000 },
  '5Y': { spanMs: 5 * 365 * 86_400_000, stepMs: 7 * 86_400_000 },
};

const fmt = (n: number) => new Decimal(n).toDecimalPlaces(2).toFixed(2);

@Injectable()
export class SandboxMarketDataAdapter implements MarketDataAdapter {
  readonly name = 'sandbox';
  constructor(private readonly redis: RedisService) {}

  async getQuote(symbol: string): Promise<Quote> {
    let staleSeconds = 0;
    try {
      staleSeconds = Number((await this.redis.client.get(`sandbox:md:stale:${symbol}`)) ?? 0);
    } catch {
      /* redis optional for sandbox data */
    }
    const at = Date.now() - staleSeconds * 1000;
    const asOfMs = Math.floor(at / 1000) * 1000;
    const last = sandboxPrice(symbol, asOfMs);
    const spread = Math.max(0.01, last * 0.0002);
    const prevClose = sandboxPrice(symbol, Math.floor(asOfMs / 86_400_000) * 86_400_000 - 1);
    return {
      symbol,
      bid: fmt(last - spread / 2),
      ask: fmt(last + spread / 2),
      last: fmt(last),
      previousClose: fmt(prevClose),
      currency: 'USD',
      asOf: new Date(asOfMs).toISOString(),
      source: 'SANDBOX-SIMULATED',
      delayed: false,
      simulated: true,
    };
  }

  async getBars(symbol: string, range: BarRange): Promise<Bar[]> {
    const { spanMs, stepMs } = RANGE[range];
    const end = Math.floor(Date.now() / stepMs) * stepMs;
    const bars: Bar[] = [];
    for (let t = end - spanMs; t <= end; t += stepMs) {
      const o = sandboxPrice(symbol, t);
      const c = sandboxPrice(symbol, t + stepMs - 1);
      const mid = sandboxPrice(symbol, t + stepMs / 2);
      bars.push({
        t: new Date(t).toISOString(),
        o: fmt(o),
        h: fmt(Math.max(o, c, mid) * 1.001),
        l: fmt(Math.min(o, c, mid) * 0.999),
        c: fmt(c),
        v: 10_000 + (hash32(`${symbol}:v:${t}`) % 90_000),
      });
    }
    return bars;
  }
}
