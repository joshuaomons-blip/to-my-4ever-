const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 })

const safe = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
export const usdFmt = (v: number | null | undefined) => usd.format(safe(v))
export const usdCompact = (v: number | null | undefined) => compact.format(safe(v))
export const signedUsd = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${usd.format(Math.abs(safe(v)))}`
export const pct = (v: number, sign = true) => `${sign && v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(safe(v)).toFixed(2)}%`
export const sharesFmt = (v: number | null | undefined, max = 6) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: max }).format(safe(v))
export const numFmt = (v: number, max = 2) => new Intl.NumberFormat('en-US', { maximumFractionDigits: max }).format(safe(v))

export const dateFmt = (d: string | Date | number) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(d))
export const dateTimeFmt = (d: string | Date | number) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(d))
export const timeFmt = (d: string | Date | number) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(d))
export const relTime = (d: string | Date) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return dateFmt(d)
}

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
