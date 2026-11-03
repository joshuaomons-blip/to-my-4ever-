'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '@/lib/api'
import { cn, dateFmt, dateTimeFmt, pct, timeFmt, usdCompact, usdFmt } from '@/lib/format'
import { Skeleton } from './ui'

export const RANGES = ['1D', '1W', '1M', '3M', '1Y', 'ALL'] as const
export type Range = (typeof RANGES)[number]

// Chart tokens (light). Text never wears series colour; grid is a hairline one step off the surface.
const AXIS = '#646a73'
const GRID = '#eceef0'
const GAIN = '#0b7a52'
const LOSS = '#c2362f'

export function RangeTabs({ value, onChange, className }: { value: Range; onChange: (r: Range) => void; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-md border border-hairline bg-surface-2 p-0.5', className)} role="tablist" aria-label="Time range">
      {RANGES.map((r) => (
        <button
          key={r}
          role="tab"
          aria-selected={value === r}
          onClick={() => onChange(r)}
          className={cn('num rounded-[5px] px-2.5 py-1 text-[12.5px] font-medium transition-colors sm:px-3', value === r ? 'bg-surface text-fg shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-hairline' : 'text-muted hover:text-fg')}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

const tickFor = (range: Range) => (t: number) =>
  range === '1D'
    ? timeFmt(t)
    : range === '1W'
      ? new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(t))
      : range === 'ALL' || range === '1Y'
        ? new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(new Date(t))
        : dateFmt(t).replace(/, \d{4}$/, '')

type Point = { t: number; v: number }

function ChartTooltip({ active, payload, range, base, label }: { active?: boolean; payload?: { payload: Point }[]; range: Range; base: number; label: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const change = base ? ((p.v - base) / base) * 100 : 0
  return (
    <div className="rounded-md border border-hairline bg-surface px-3 py-2 shadow-[0_8px_24px_-8px_rgb(0_0_0/0.18)]">
      <p className="text-[12px] text-muted">{range === '1D' || range === '1W' ? dateTimeFmt(p.t) : dateFmt(p.t)}</p>
      <p className="num mt-0.5 text-[15px] font-semibold text-fg">{usdFmt(p.v)}</p>
      <p className={cn('num text-[12px]', change >= 0 ? 'text-gain' : 'text-loss')}>
        {pct(change)} <span className="text-muted">since start of range</span>
      </p>
      <p className="mt-0.5 text-[11px] text-faint">{label}</p>
    </div>
  )
}

export function AreaSeries({ data, range, height = 280, label = 'Simulated', compactAxis }: { data: Point[]; range: Range; height?: number; label?: string; compactAxis?: boolean }) {
  const id = useId().replace(/:/g, '')
  const base = data.find((d) => d.v !== 0)?.v ?? 0
  const up = (data.at(-1)?.v ?? 0) >= base
  const color = up ? GAIN : LOSS
  const [min, max] = useMemo(() => {
    const vs = data.map((d) => d.v)
    const lo = Math.min(...vs)
    const hi = Math.max(...vs)
    const pad = (hi - lo) * 0.12 || hi * 0.02 || 1
    return [Math.max(0, lo - pad), hi + pad]
  }, [data])
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.1} />
              <stop offset="100%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={tickFor(range)} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={48} />
          <YAxis domain={[min, max]} orientation="right" tickFormatter={(v: number) => (compactAxis ? usdCompact(v) : `$${v.toFixed(0)}`)} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={false} width={compactAxis ? 60 : 50} />
          <Tooltip content={(props) => <ChartTooltip {...(props as object)} range={range} base={base} label={label} />} cursor={{ stroke: '#9aa0a8', strokeWidth: 1 }} />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill={`url(#g${id})`} isAnimationActive animationDuration={500} dot={false} activeDot={{ r: 4.5, fill: color, stroke: '#ffffff', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Fetches a series from the API for the selected range. */
export function useSeries(kind: 'market' | 'portfolio', range: Range) {
  const key = `${kind}:${range}`
  const [state, setState] = useState<{ key: string; error?: string; data: Point[] }>({ key: '', data: [] })
  useEffect(() => {
    let alive = true
    const url = kind === 'market' ? `/api/market/history?range=${range}` : `/api/portfolio/history?range=${range}`
    api<{ points: { t: number; p: number; v?: number }[] }>(url).then((res) => {
      if (!alive) return
      if (!res.ok) setState({ key, error: res.error, data: [] })
      else setState({ key, data: res.data.points.map((p) => ({ t: p.t, v: kind === 'market' ? p.p : (p.v ?? 0) })) })
    })
    return () => {
      alive = false
    }
  }, [kind, range, key])
  return { loading: state.key !== key, error: state.key === key ? state.error : undefined, data: state.key === key ? state.data : [] }
}

export function PriceChartCard({ defaultRange = '1M', height = 300, kind = 'market', title, emptyHint }: { defaultRange?: Range; height?: number; kind?: 'market' | 'portfolio'; title?: React.ReactNode; emptyHint?: React.ReactNode }) {
  const [range, setRange] = useState<Range>(defaultRange)
  const { loading, error, data } = useSeries(kind, range)
  // Measure from the first non-zero value so ranges that start before the first deposit read sensibly.
  const first = data.find((d) => d.v !== 0)?.v ?? 0
  const last = data.at(-1)?.v ?? 0
  const change = last - first
  const allZero = data.length > 0 && data.every((d) => d.v === 0)
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          {title}
          {!loading && !error && !allZero && (
            <p className={cn('num mt-1 text-[13px]', change >= 0 ? 'text-gain' : 'text-loss')}>
              {change >= 0 ? '+' : '−'}
              {usdFmt(Math.abs(change))} ({pct(first ? (change / first) * 100 : 0)}) <span className="text-muted">over {range === 'ALL' ? 'all time' : range}</span>
            </p>
          )}
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <div className="px-2 pt-4 pb-3 sm:px-3">
        {loading ? (
          <div style={{ height }} className="px-3">
            <Skeleton className="h-full" />
          </div>
        ) : error ? (
          <p className="px-4 py-16 text-center text-sm text-loss">{error}</p>
        ) : allZero ? (
          <div className="grid place-items-center px-4 text-center text-sm text-muted" style={{ height }}>
            {emptyHint ?? 'No data yet'}
          </div>
        ) : (
          <AreaSeries data={data} range={range} height={height} compactAxis={kind === 'portfolio'} label={kind === 'portfolio' ? 'Portfolio value' : 'Simulated TSLA price'} />
        )}
      </div>
    </div>
  )
}

// Validated categorical order (dataviz reference palette, light): blue, orange, aqua.
const SERIES = [
  { key: 'volume', name: 'Trading volume', color: '#2a78d6' },
  { key: 'deposits', name: 'Deposits', color: '#eb6834' },
  { key: 'withdrawals', name: 'Withdrawals', color: '#1baf7a' },
] as const

export function ActivityBars({ data }: { data: { day: string; deposits: number; withdrawals: number; volume: number }[] }) {
  const totals = SERIES.map((s) => ({ ...s, total: data.reduce((a, d) => a + d[s.key], 0) }))
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 px-3 text-[13px] text-fg-2" aria-label="Legend">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="30%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="day" tickFormatter={(d: string) => dateFmt(d + 'T12:00:00Z').replace(/, \d{4}$/, '')} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={36} />
            <YAxis tickFormatter={(v: number) => usdCompact(v)} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={false} width={58} orientation="right" />
            <Tooltip
              cursor={{ fill: 'rgba(21,23,26,0.04)' }}
              contentStyle={{ background: '#fff', border: '1px solid #e3e5e8', borderRadius: 6, fontSize: 13, boxShadow: '0 8px 24px -8px rgba(0,0,0,.18)' }}
              labelStyle={{ color: AXIS }}
              itemStyle={{ color: '#15171a' }}
              formatter={(v) => usdFmt(Number(v))}
              labelFormatter={(d) => dateFmt(String(d) + 'T12:00:00Z')}
            />
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={12} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="mt-3 w-full text-[13px]">
        <caption className="sr-only">30-day totals</caption>
        <tbody className="divide-y divide-hairline border-t border-hairline">
          {totals.map((s) => (
            <tr key={s.key}>
              <th scope="row" className="px-3 py-2 text-left font-normal text-fg-2">
                <span className="mr-2 inline-block size-2.5 rounded-[3px] align-middle" style={{ background: s.color }} />
                {s.name}, 30 days
              </th>
              <td className="num px-3 py-2 text-right text-fg">{usdFmt(s.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
