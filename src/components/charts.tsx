'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '@/lib/api'
import { cn, dateFmt, dateTimeFmt, pct, timeFmt, usdCompact, usdFmt } from '@/lib/format'
import { Skeleton } from './ui'

export const RANGES = ['1D', '1W', '1M', '3M', '1Y', 'ALL'] as const
export type Range = (typeof RANGES)[number]

export function RangeTabs({ value, onChange, className }: { value: Range; onChange: (r: Range) => void; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-full border border-white/[0.08] bg-ink/60 p-0.5', className)} role="tablist">
      {RANGES.map((r) => (
        <button
          key={r}
          role="tab"
          aria-selected={value === r}
          onClick={() => onChange(r)}
          className={cn('num rounded-full px-2.5 py-1 text-[11px] font-medium transition-all sm:px-3', value === r ? 'bg-white text-ink' : 'text-mute hover:text-white')}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

const tickFor = (range: Range) => (t: number) =>
  range === '1D' ? timeFmt(t) : range === '1W' ? new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(t)) : range === 'ALL' || range === '1Y' ? new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(new Date(t)) : dateFmt(t).replace(/, \d{4}$/, '')

type Point = { t: number; v: number }

function ChartTooltip({ active, payload, range, base, label }: { active?: boolean; payload?: { payload: Point }[]; range: Range; base: number; label: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const change = base ? ((p.v - base) / base) * 100 : 0
  return (
    <div className="rounded-xl border border-white/10 bg-carbon-2/95 px-3.5 py-2.5 shadow-xl backdrop-blur-xl">
      <p className="text-[10px] uppercase tracking-[0.14em] text-dim">{range === '1D' || range === '1W' ? dateTimeFmt(p.t) : dateFmt(p.t)}</p>
      <p className="num mt-1 text-sm font-medium text-white">{usdFmt(p.v)}</p>
      <p className={cn('num text-[11px]', change >= 0 ? 'text-gain' : 'text-loss')}>
        {pct(change)} <span className="text-dim">vs start · {label}</span>
      </p>
    </div>
  )
}

export function AreaSeries({ data, range, height = 280, label = 'Simulated', compactAxis }: { data: Point[]; range: Range; height?: number; label?: string; compactAxis?: boolean }) {
  const id = useId().replace(/:/g, '')
  const base = data[0]?.v ?? 0
  const up = (data.at(-1)?.v ?? 0) >= base
  const color = up ? 'var(--color-gain)' : 'var(--color-loss)'
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
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={tickFor(range)} tick={{ fill: '#5d6168', fontSize: 10.5 }} tickLine={false} axisLine={false} minTickGap={42} />
          <YAxis domain={[min, max]} orientation="right" tickFormatter={(v: number) => (compactAxis ? usdCompact(v) : `$${v.toFixed(0)}`)} tick={{ fill: '#5d6168', fontSize: 10.5 }} tickLine={false} axisLine={false} width={compactAxis ? 56 : 48} />
          <Tooltip content={(props) => <ChartTooltip {...(props as object)} range={range} base={base} label={label} />} cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeDasharray: '3 3' }} />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} fill={`url(#g${id})`} isAnimationActive animationDuration={700} dot={false} activeDot={{ r: 3.5, fill: color, stroke: '#080808', strokeWidth: 2 }} />
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
  const first = data[0]?.v ?? 0
  const last = data.at(-1)?.v ?? 0
  const change = last - first
  const allZero = data.length > 0 && data.every((d) => d.v === 0)
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <div>
          {title}
          {!loading && !error && !allZero && (
            <p className={cn('num mt-1 text-xs', change >= 0 ? 'text-gain' : 'text-loss')}>
              {change >= 0 ? '+' : '−'}
              {usdFmt(Math.abs(change))} ({pct(first ? (change / first) * 100 : 0)}) <span className="text-dim">· {range}</span>
            </p>
          )}
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <div className="px-2 pt-4 pb-3 sm:px-3">
        {loading ? (
          <div style={{ height }} className="px-3"><Skeleton className="h-full rounded-xl" /></div>
        ) : error ? (
          <p className="px-4 py-16 text-center text-sm text-loss">{error}</p>
        ) : allZero ? (
          <div className="grid place-items-center px-4 text-center text-sm text-mute" style={{ height }}>{emptyHint ?? 'No data yet'}</div>
        ) : (
          <AreaSeries data={data} range={range} height={height} compactAxis={kind === 'portfolio'} label={kind === 'portfolio' ? 'Simulated portfolio' : 'Sandbox price'} />
        )}
      </div>
    </div>
  )
}

export function ActivityBars({ data }: { data: { day: string; deposits: number; withdrawals: number; volume: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="day" tickFormatter={(d: string) => dateFmt(d + 'T12:00:00Z').replace(/, \d{4}$/, '')} tick={{ fill: '#5d6168', fontSize: 10.5 }} tickLine={false} axisLine={false} minTickGap={30} />
          <YAxis tickFormatter={(v: number) => usdCompact(v)} tick={{ fill: '#5d6168', fontSize: 10.5 }} tickLine={false} axisLine={false} width={56} orientation="right" />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            contentStyle={{ background: 'rgba(27,27,27,.96)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, fontSize: 12 }}
            labelStyle={{ color: '#8b9099' }}
            formatter={(v) => usdFmt(Number(v))}
            labelFormatter={(d) => dateFmt(String(d) + 'T12:00:00Z')}
          />
          <Bar dataKey="volume" name="Trading volume" fill="var(--color-accent)" radius={[3, 3, 0, 0]} maxBarSize={14} />
          <Bar dataKey="deposits" name="Deposits" fill="#c9ccd1" radius={[3, 3, 0, 0]} maxBarSize={14} />
          <Bar dataKey="withdrawals" name="Withdrawals" fill="#5d6168" radius={[3, 3, 0, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
