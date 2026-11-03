'use client'

import { useEffect, useRef, useState } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, pct, timeFmt, usdFmt } from '@/lib/format'

export type QuoteDTO = {
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

/** Polls the sandbox quote. Returns the latest quote (seeded with server-rendered value). */
export function useLiveQuote(initial: QuoteDTO, intervalMs = 15_000) {
  const [quote, setQuote] = useState(initial)
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return
      const res = await api<{ quote: QuoteDTO }>('/api/market/quote')
      if (res.ok) setQuote(res.data.quote)
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return quote
}

export function LiveQuote({ initial, size = 'lg', className }: { initial: QuoteDTO; size?: 'lg' | 'sm'; className?: string }) {
  const quote = useLiveQuote(initial)
  const prev = useRef(quote.price)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  useEffect(() => {
    if (quote.price !== prev.current) {
      setFlash(quote.price > prev.current ? 'up' : 'down')
      prev.current = quote.price
      const t = setTimeout(() => setFlash(null), 900)
      return () => clearTimeout(t)
    }
  }, [quote.price])
  const up = quote.change >= 0
  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={cn('num font-medium text-white transition-colors duration-700', size === 'lg' ? 'text-4xl sm:text-5xl' : 'text-2xl', flash === 'up' && 'text-gain', flash === 'down' && 'text-loss')}>
          {usdFmt(quote.price)}
        </span>
        <span className={cn('num inline-flex items-center gap-1 text-sm', up ? 'text-gain' : 'text-loss')}>
          {up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
          {up ? '+' : '−'}
          {usdFmt(Math.abs(quote.change))} ({pct(quote.changePercent)})
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-dim">
        Sandbox price · updated {timeFmt(quote.asOf)} · not real market data
      </p>
    </div>
  )
}
