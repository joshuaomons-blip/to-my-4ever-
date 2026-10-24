export interface Quote {
  symbol: string;
  bid: string;
  ask: string;
  last: string;
  previousClose: string;
  currency: string;
  /** Timestamp of the price at the source (not the time we fetched it). */
  asOf: string;
  source: string;
  /** True when data is delayed or simulated; the UI must label it. */
  delayed: boolean;
  simulated: boolean;
}

export interface Bar {
  t: string;
  o: string;
  h: string;
  l: string;
  c: string;
  v: number;
}

export type BarRange = '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y';

export interface MarketDataAdapter {
  readonly name: string;
  getQuote(symbol: string): Promise<Quote>;
  getBars(symbol: string, range: BarRange): Promise<Bar[]>;
}

export const MARKET_DATA_ADAPTER = Symbol('MARKET_DATA_ADAPTER');
