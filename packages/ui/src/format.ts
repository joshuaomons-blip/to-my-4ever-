/** Formatting helpers. Inputs are decimal strings from the API (never floats from user input). */
export function formatMoney(amount: string | number | null | undefined, currency = 'USD', opts: { sign?: boolean; compact?: boolean } = {}): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return '—';
  const f = new Intl.NumberFormat('en-US', {
    style: 'currency', currency, notation: opts.compact ? 'compact' : 'standard',
    minimumFractionDigits: opts.compact ? 0 : 2, maximumFractionDigits: 2,
    signDisplay: opts.sign ? 'exceptZero' : 'auto',
  });
  return f.format(n);
}

export function formatNumber(v: string | number | null | undefined, max = 4): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: max }).format(n) : '—';
}

export function formatPct(v: string | number | null | undefined, opts: { sign?: boolean } = { sign: true }): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${opts.sign && n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function formatDateTime(v: string | Date | null | undefined, withSeconds = false): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined, timeZoneName: 'short',
  }).format(d);
}

export function formatDate(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

export function relativeTime(v: string | Date): string {
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const toneOf = (v: string | number | null | undefined): 'pos' | 'neg' | 'flat' => {
  const n = Number(v);
  return !Number.isFinite(n) || n === 0 ? 'flat' : n > 0 ? 'pos' : 'neg';
};
