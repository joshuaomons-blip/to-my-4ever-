'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { CircleCheck, Info, ShieldAlert } from 'lucide-react'
import { Alert, Button, ButtonLink, Field, Input, SimBadge } from '@/components/ui'
import { Modal } from '@/components/modal'
import { useLiveQuote, type QuoteDTO } from '@/components/live-quote'
import { useToast } from '@/components/toast'
import { api } from '@/lib/api'
import { cn, dateTimeFmt, sharesFmt, usdFmt } from '@/lib/format'

type Trading = { feeBps: number; feeFlat: number; minOrder: number }
type Receipt = { id: string; reference: string; type: 'BUY' | 'SELL'; shares: number; price: number; amount: number; fee: number; createdAt: string; brokerRef: string }

export function TradePanel({
  initialQuote,
  cash,
  shares,
  trading,
  blocked,
  defaultSide,
}: {
  initialQuote: QuoteDTO
  cash: number
  shares: number
  trading: Trading
  blocked: { reason: string; href: string; cta: string } | null
  defaultSide: 'buy' | 'sell'
}) {
  const router = useRouter()
  const toast = useToast()
  const quote = useLiveQuote(initialQuote, 10_000)
  const [side, setSide] = useState<'buy' | 'sell'>(defaultSide)
  const [mode, setMode] = useState<'amount' | 'shares'>('amount')
  const [raw, setRaw] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)

  const value = Number(raw)
  const est = useMemo(() => {
    if (!value || value <= 0) return null
    const qty = mode === 'shares' ? value : Math.floor((value / quote.price) * 1e6) / 1e6
    const gross = Math.round(qty * quote.price * 100) / 100
    const fee = Math.round(((gross * trading.feeBps) / 10_000 + trading.feeFlat) * 100) / 100
    const total = side === 'buy' ? gross + fee : gross - fee
    return { qty, gross, fee, total }
  }, [value, mode, quote.price, trading, side])

  const validation = (() => {
    if (!est) return null
    if (est.gross < trading.minOrder) return `Minimum order is ${usdFmt(trading.minOrder)}`
    if (side === 'buy' && est.total > cash + 0.001) return `Exceeds available cash (${usdFmt(cash)})`
    if (side === 'sell' && est.qty > shares + 1e-9) return `You hold ${sharesFmt(shares)} shares`
    if (side === 'sell' && est.total <= 0) return 'Order too small to cover fees'
    return null
  })()

  const setMax = () => {
    if (side === 'buy') {
      const maxGross = Math.max(0, (cash - trading.feeFlat) / (1 + trading.feeBps / 10_000))
      setRaw(mode === 'amount' ? (Math.floor(maxGross * 100) / 100).toString() : (Math.floor((maxGross / quote.price) * 1e6) / 1e6).toString())
    } else {
      setRaw(mode === 'shares' ? shares.toString() : (Math.floor(shares * quote.price * 100) / 100).toString())
    }
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    const res = await api<{ transaction: Receipt }>('/api/trade', { body: { side, mode, value } })
    setSubmitting(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setReviewing(false)
    setReceipt(res.data.transaction)
    setRaw('')
    toast({ tone: 'success', title: `Simulated ${side} order filled`, body: `${sharesFmt(res.data.transaction.shares)} TSLA @ ${usdFmt(res.data.transaction.price)}` })
    router.refresh()
  }

  return (
    <div className="p-5 sm:p-6">
      <div className="grid grid-cols-2 rounded-full border border-white/[0.08] bg-ink/70 p-1">
        {(['buy', 'sell'] as const).map((s) => (
          <button key={s} onClick={() => { setSide(s); setRaw(''); setError(null) }} className={cn('rounded-full py-2 text-sm font-medium capitalize transition-all', side === s ? (s === 'buy' ? 'bg-gain text-ink' : 'bg-loss text-white') : 'text-mute hover:text-white')}>
            {s}
          </button>
        ))}
      </div>

      {blocked ? (
        <div className="mt-6 space-y-4">
          <Alert tone="warn" icon={<ShieldAlert className="size-5" />} title="Trading locked">{blocked.reason}</Alert>
          <ButtonLink href={blocked.href} className="w-full">{blocked.cta}</ButtonLink>
        </div>
      ) : (
        <>
          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-mute">Order type</p>
            <div className="inline-flex rounded-full border border-white/[0.08] p-0.5 text-[11px]">
              {(['amount', 'shares'] as const).map((m) => (
                <button key={m} onClick={() => { setMode(m); setRaw('') }} className={cn('rounded-full px-3 py-1 transition-colors', mode === m ? 'bg-white text-ink' : 'text-mute hover:text-white')}>
                  {m === 'amount' ? 'Dollars' : 'Shares'}
                </button>
              ))}
            </div>
          </div>

          <Field label={mode === 'amount' ? `Amount to ${side} (USD)` : `Shares to ${side}`} className="mt-4" htmlFor="trade-value" error={validation ?? undefined}>
            <div className="relative">
              {mode === 'amount' && <span className="num pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl text-dim">$</span>}
              <Input
                id="trade-value"
                inputMode="decimal"
                type="number"
                min="0"
                step={mode === 'amount' ? '0.01' : '0.000001'}
                placeholder={mode === 'amount' ? '0.00' : '0.000000'}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                className={cn('num h-14 text-xl', mode === 'amount' ? 'pl-9' : '')}
                invalid={!!validation}
              />
              <button onClick={setMax} type="button" className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-silver hover:bg-white/10">Max</button>
            </div>
          </Field>

          {mode === 'amount' && side === 'buy' && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[50, 100, 250, 500, 1000].map((v) => (
                <button key={v} onClick={() => setRaw(String(v))} className="num rounded-full border border-white/[0.08] px-3 py-1 text-xs text-mute hover:border-white/20 hover:text-white">${v}</button>
              ))}
            </div>
          )}

          <dl className="mt-6 space-y-2.5 rounded-2xl border border-white/[0.06] bg-ink/50 p-4 text-sm">
            <div className="flex justify-between"><dt className="text-mute">Sandbox price</dt><dd className="num">{usdFmt(quote.price)}</dd></div>
            <div className="flex justify-between"><dt className="text-mute">Est. shares</dt><dd className="num">{est ? sharesFmt(est.qty) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-mute">Simulated fee ({(trading.feeBps / 100).toFixed(2)}%{trading.feeFlat ? ` + ${usdFmt(trading.feeFlat)}` : ''})</dt><dd className="num">{est ? usdFmt(est.fee) : '—'}</dd></div>
            <div className="flex justify-between border-t border-white/[0.06] pt-2.5 font-medium"><dt>{side === 'buy' ? 'Est. total cost' : 'Est. proceeds'}</dt><dd className="num">{est ? usdFmt(est.total) : '—'}</dd></div>
          </dl>
          <p className="mt-3 text-[11px] text-dim">{side === 'buy' ? <>Available cash: <span className="num text-silver">{usdFmt(cash)}</span></> : <>Shares held: <span className="num text-silver">{sharesFmt(shares)}</span></>}</p>

          <Button size="lg" className={cn('mt-5 w-full', side === 'buy' ? 'bg-gain text-ink shadow-none hover:brightness-110' : 'bg-loss shadow-none')} disabled={!est || !!validation} onClick={() => { setError(null); setReviewing(true) }}>
            Review {side} order
          </Button>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-dim">
            <Info className="mt-px size-3 shrink-0" /> Simulated market order. Fills instantly at the sandbox price when submitted. No real shares are bought or sold.
          </p>
        </>
      )}

      <Modal open={reviewing} onClose={() => !submitting && setReviewing(false)} title={`Confirm ${side} order`}>
        {est && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/[0.08] bg-ink/60 p-5 text-center">
              <p className="eyebrow">{side === 'buy' ? 'You are buying' : 'You are selling'}</p>
              <p className="num mt-2 text-3xl font-medium">{sharesFmt(est.qty)} <span className="text-lg text-mute">TSLA</span></p>
              <p className="num mt-1 text-xs text-dim">≈ {usdFmt(est.gross)} at {usdFmt(quote.price)}</p>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-mute">Order</dt><dd>Market · {mode === 'amount' ? 'by dollar amount' : 'by shares'}</dd></div>
              <div className="flex justify-between"><dt className="text-mute">Simulated fee</dt><dd className="num">{usdFmt(est.fee)}</dd></div>
              <div className="flex justify-between font-medium"><dt>{side === 'buy' ? 'Total cost' : 'Net proceeds'}</dt><dd className="num">{usdFmt(est.total)}</dd></div>
            </dl>
            <Alert tone="accent" icon={<SimBadge>Sandbox</SimBadge>}>This order uses virtual funds. The final fill price may differ slightly if the sandbox price moves before submission.</Alert>
            {error && <Alert tone="loss">{error}</Alert>}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setReviewing(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={submit} loading={submitting}>Confirm {side}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Order filled">
        {receipt && (
          <div className="space-y-5">
            <div className="flex flex-col items-center text-center">
              <span className="grid size-14 place-items-center rounded-full bg-gain/10 text-gain"><CircleCheck className="size-7" /></span>
              <p className="mt-4 font-display text-xl">Simulated {receipt.type === 'BUY' ? 'purchase' : 'sale'} complete</p>
              <p className="num mt-1 text-xs text-dim">{receipt.reference}</p>
            </div>
            <dl className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] px-4 text-sm">
              {[
                ['Shares', sharesFmt(receipt.shares)],
                ['Fill price', usdFmt(receipt.price)],
                ['Gross', usdFmt(receipt.amount)],
                ['Fee', usdFmt(receipt.fee)],
                [receipt.type === 'BUY' ? 'Total debited' : 'Net credited', usdFmt(receipt.type === 'BUY' ? receipt.amount + receipt.fee : receipt.amount - receipt.fee)],
                ['Time', dateTimeFmt(receipt.createdAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2.5"><dt className="text-mute">{k}</dt><dd className="num">{v}</dd></div>
              ))}
            </dl>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setReceipt(null)}>Done</Button>
              <Link href={`/app/transactions/${receipt.id}`} className="inline-flex h-10 items-center justify-center rounded-full bg-white text-sm font-medium text-ink">View receipt</Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
