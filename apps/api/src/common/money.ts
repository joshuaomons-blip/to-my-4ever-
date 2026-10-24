import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

export const CURRENCY_EXPONENT: Record<string, number> = { USD: 2, GBP: 2, EUR: 2, NGN: 2 };

export function exponentOf(currency: string): number {
  const e = CURRENCY_EXPONENT[currency];
  if (e === undefined) throw new Error(`Unsupported currency ${currency}`);
  return e;
}

/** Decimal string ("12.34") -> integer minor units. Rejects values with excess precision. */
export function toMinor(amount: string | Decimal, currency: string): bigint {
  const d = new Decimal(amount);
  const scaled = d.mul(new Decimal(10).pow(exponentOf(currency)));
  if (!scaled.isInteger()) throw new Error(`Amount ${amount} has more precision than ${currency} allows`);
  return BigInt(scaled.toFixed(0));
}

/** Round a computed decimal amount to minor units (used for estimates and fees). */
export function roundToMinor(amount: Decimal, currency: string, mode: Decimal.Rounding = Decimal.ROUND_UP): bigint {
  const scaled = amount.mul(new Decimal(10).pow(exponentOf(currency))).toDecimalPlaces(0, mode);
  return BigInt(scaled.toFixed(0));
}

export function fromMinor(minor: bigint, currency: string): string {
  const e = exponentOf(currency);
  return new Decimal(minor.toString()).div(new Decimal(10).pow(e)).toFixed(e);
}

export interface Money {
  amount: string;
  currency: string;
}

export const money = (minor: bigint, currency: string): Money => ({ amount: fromMinor(minor, currency), currency });

export { Decimal };
