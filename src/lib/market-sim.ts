// Pure simulation math (no server-only import) so the seed script can share it.
// Imported by the app only via src/server/broker/market.ts.

/**
 * SANDBOX MARKET DATA — deterministic simulated TSLA prices.
 * Not real market data. Every user sees the same simulated price at the same moment,
 * so fills, charts and statements stay consistent.
 */

export type Range = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL'
export const RANGES: Range[] = ['1D', '1W', '1M', '3M', '1Y', 'ALL']
export type PricePoint = { t: number; p: number }

const DAY = 86_400_000
const BUCKET = 15 * 60_000
const BUCKETS = DAY / BUCKET // 96
const ANCHOR = Date.UTC(2021, 0, 4)
export const SHARES_OUTSTANDING = 3_216_000_000 // illustrative

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function gauss(r: () => number) {
  let u = 0
  while (u === 0) u = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r())
}

const closes: number[] = []
function target(d: number) {
  return 235 + 80 * (d / 2000) + 45 * Math.sin(d / 170) + 18 * Math.sin(d / 37)
}
/** Simulated daily close for day index d (mean-reverting log random walk). */
export function close(d: number): number {
  if (d < 0) return target(0)
  if (closes.length === 0) closes.push(target(0))
  while (closes.length <= d) {
    const i = closes.length
    const r = mulberry32(0x7e51a + i * 2654435761)
    const prev = closes[i - 1]
    const lp = Math.log(prev) + 0.031 * gauss(r) - 0.045 * (Math.log(prev) - Math.log(target(i)))
    closes.push(Math.exp(lp))
  }
  return closes[d]
}

const pathCache = new Map<number, number[]>()
/** 97 intraday points (every 15 min) bridging close(d-1) → close(d). */
function intraday(d: number): number[] {
  const hit = pathCache.get(d)
  if (hit) return hit
  const start = close(d - 1)
  const end = close(d)
  const r = mulberry32(0xd1a7 + d * 40503)
  const w = [0]
  const sigma = 0.0024
  for (let i = 1; i <= BUCKETS; i++) w.push(w[i - 1] + sigma * gauss(r))
  const path = w.map((wi, i) => {
    const bridge = wi - (i / BUCKETS) * w[BUCKETS]
    return Math.exp(Math.log(start) + (i / BUCKETS) * (Math.log(end) - Math.log(start)) + bridge)
  })
  if (pathCache.size > 64) pathCache.clear()
  pathCache.set(d, path)
  return path
}

const dayIndex = (t: number) => Math.floor((t - ANCHOR) / DAY)

export function priceAt(t: number): number {
  const d = dayIndex(t)
  const within = t - ANCHOR - d * DAY
  const b = Math.floor(within / BUCKET)
  const f = (within - b * BUCKET) / BUCKET
  const path = intraday(d)
  return path[b] + (path[b + 1] - path[b]) * f
}

const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp

export type Quote = {
  symbol: string
  price: number
  previousClose: number
  open: number
  dayHigh: number
  dayLow: number
  change: number
  changePercent: number
  volume: number
  marketCap: number
  week52High: number
  week52Low: number
  volatility30d: number
  asOf: string
  source: 'sandbox'
}

export function sandboxQuote(symbol = 'TSLA', now = Date.now()): Quote {
  const d = dayIndex(now)
  const price = round(priceAt(now))
  const path = intraday(d)
  const b = Math.floor((now - ANCHOR - d * DAY) / BUCKET)
  const today = [...path.slice(0, b + 1), price]
  const previousClose = round(close(d - 1))
  const yearCloses = Array.from({ length: 252 }, (_, i) => close(d - 1 - i))
  const rets = Array.from({ length: 30 }, (_, i) => Math.log(close(d - 1 - i) / close(d - 2 - i)))
  const mean = rets.reduce((a, b2) => a + b2, 0) / rets.length
  const sd = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1))
  const vr = mulberry32(d * 7919)
  return {
    symbol,
    price,
    previousClose,
    open: round(path[0]),
    dayHigh: round(Math.max(...today)),
    dayLow: round(Math.min(...today)),
    change: round(price - previousClose),
    changePercent: round(((price - previousClose) / previousClose) * 100),
    volume: Math.round((62 + vr() * 70) * 1_000_000 * ((b + 1) / BUCKETS)),
    marketCap: price * SHARES_OUTSTANDING,
    week52High: round(Math.max(price, ...yearCloses)),
    week52Low: round(Math.min(price, ...yearCloses)),
    volatility30d: round(sd * Math.sqrt(252) * 100, 1),
    asOf: new Date(now).toISOString(),
    source: 'sandbox',
  }
}

export function sandboxHistory(range: Range, now = Date.now()): PricePoint[] {
  const pts: PricePoint[] = []
  const push = (t: number) => pts.push({ t, p: round(priceAt(t)) })
  const stepped = (span: number, step: number) => {
    const start = now - span
    for (let t = start - (start % step) + step; t < now; t += step) push(t)
  }
  switch (range) {
    case '1D': stepped(DAY, BUCKET); break
    case '1W': stepped(7 * DAY, 3_600_000); break
    case '1M': stepped(30 * DAY, 6 * 3_600_000); break
    case '3M': stepped(90 * DAY, DAY); break
    case '1Y': stepped(365 * DAY, DAY); break
    case 'ALL': stepped(now - ANCHOR - DAY, 3 * DAY); break
  }
  push(now)
  return pts
}
