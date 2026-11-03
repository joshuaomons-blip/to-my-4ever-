'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CreditCard, Landmark, ShieldCheck } from 'lucide-react'
import { Alert, Button, Field, Input } from '@/components/ui'
import { useForm } from '@/components/use-form'
import { useToast } from '@/components/toast'
import { api } from '@/lib/api'
import { cn, usdFmt } from '@/lib/format'

const METHODS = [
  { id: 'BANK_TRANSFER', icon: Landmark, title: 'Bank transfer', body: 'Send money from your bank using the reference we give you. Usually arrives in 1–3 business days.' },
  { id: 'CARD', icon: CreditCard, title: 'Debit or credit card', body: 'Pay on the payment provider’s secure page. Usually confirmed within a minute.' },
] as const

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}abcdef`)

/** Re-renders the page while a deposit is waiting for the provider. */
export function AutoRefresh({ active, everyMs = 4000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => router.refresh(), everyMs)
    return () => clearInterval(id)
  }, [active, everyMs, router])
  return null
}

export function DepositForm({ min, max, disabledReason, providerLabel }: { min: number; max: number; disabledReason?: string; providerLabel: string }) {
  const router = useRouter()
  const toast = useToast()
  const f = useForm({ amount: '', method: 'BANK_TRANSFER' as 'BANK_TRANSFER' | 'CARD' })
  // One key per intended deposit: double clicks and retries return the same request.
  const [key, setKey] = useState(newKey)
  const amount = Number(f.values.amount)
  const localError = f.values.amount ? (amount < min ? `The minimum is ${usdFmt(min)}` : amount > max ? `The maximum is ${usdFmt(max)}` : null) : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || localError) return
    const res = await f.submit<{ deposit: { id: string; reference: string; checkoutUrl: string | null; method: string } }>('/api/payments/deposits', { amount, method: f.values.method, idempotencyKey: key })
    if (!res) return
    setKey(newKey())
    const d = res.deposit
    if (d.method === 'CARD' && d.checkoutUrl) {
      toast({ tone: 'info', title: 'Opening secure payment page', body: d.reference })
      if (d.checkoutUrl.startsWith('/')) router.push(d.checkoutUrl)
      else window.location.assign(d.checkoutUrl)
    } else {
      router.push(`/account/funding/${d.id}`)
    }
  }

  if (disabledReason) return <Alert tone="warn" title="Adding funds is unavailable">{disabledReason}</Alert>

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <Field label="Amount (USD)" error={localError || f.errors.amount} htmlFor="dep-amt" hint={`Between ${usdFmt(min)} and ${usdFmt(max)}`}>
        <div className="relative">
          <span className="num pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-lg text-muted">$</span>
          <Input id="dep-amt" type="number" inputMode="decimal" min={min} max={max} step="0.01" placeholder="0.00" className="num h-12 pl-8 text-lg" value={f.values.amount} onChange={(e) => f.set('amount', e.target.value)} invalid={!!(localError || f.errors.amount)} />
        </div>
      </Field>
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-fg-1">Payment method</legend>
        <div className="grid gap-2">
          {METHODS.map((m) => (
            <label key={m.id} className={cn('flex cursor-pointer gap-3.5 rounded-md border p-4 transition-colors', f.values.method === m.id ? 'border-fg bg-surface-2 ring-1 ring-fg' : 'border-hairline hover:border-fg/30')}>
              <input type="radio" name="method" className="mt-1 accent-[var(--color-fg)]" checked={f.values.method === m.id} onChange={() => f.set('method', m.id)} />
              <span className="flex-1">
                <span className="flex items-center gap-2 text-[15px] font-medium">
                  <m.icon className="size-4 text-fg-2" /> {m.title}
                </span>
                <span className="mt-1 block text-[13px] leading-relaxed text-muted">{m.body}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" size="lg" className="w-full" loading={f.loading} disabled={!amount || !!localError}>
        {f.values.method === 'CARD' ? 'Continue to secure payment' : 'Get bank transfer details'}
      </Button>
      <p className="flex gap-2 text-[13px] leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        Processed by {providerLabel}. We never see or store card numbers or bank log-ins.
      </p>
    </form>
  )
}

export function DepositActions({ id, status, method, checkoutUrl, testMode }: { id: string; status: string; method: 'BANK_TRANSFER' | 'CARD'; checkoutUrl: string | null; testMode: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  if (status !== 'AWAITING_PAYMENT') return null

  async function run(key: string, path: string, body?: unknown) {
    setBusy(key)
    const r = await api<{ status?: string }>(path, { method: 'POST', body })
    setBusy(null)
    if (!r.ok) return toast({ tone: 'error', title: r.error })
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {method === 'CARD' && checkoutUrl && (
          <Button onClick={() => (checkoutUrl.startsWith('/') ? router.push(checkoutUrl) : window.location.assign(checkoutUrl))}>Continue to payment</Button>
        )}
        <Button variant="ghost" loading={busy === 'cancel'} onClick={() => window.confirm('Cancel this deposit? You can start a new one at any time.') && run('cancel', `/api/payments/deposits/${id}/cancel`)}>
          Cancel deposit
        </Button>
      </div>
      {testMode && method === 'BANK_TRANSFER' && (
        <div className="rounded-md border border-dashed border-warn/40 bg-warn/[0.04] p-4">
          <p className="text-sm font-semibold text-warn">Test mode tools</p>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
            No real bank exists in test mode. These buttons make the test provider behave as if your bank sent (or returned) the transfer. The provider then sends a signed
            notification that the platform verifies, exactly as it would in production.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="light" loading={busy === 'ok'} onClick={() => run('ok', `/api/payments/test/${id}`, { outcome: 'succeeded' })}>
              Simulate transfer received
            </Button>
            <Button size="sm" variant="ghost" loading={busy === 'fail'} onClick={() => run('fail', `/api/payments/test/${id}`, { outcome: 'declined' })}>
              Simulate returned transfer
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function TestCheckout({ id, amount, reference, merchant }: { id: string; amount: number; reference: string; merchant: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cards = [
    { outcome: 'succeeded', number: '4242 4242 4242 4242', label: 'Payment succeeds' },
    { outcome: 'declined', number: '4000 0000 0000 0002', label: 'Card is declined' },
    { outcome: 'insufficient_funds', number: '4000 0000 0000 9995', label: 'Insufficient funds' },
  ] as const
  async function pay(outcome: string) {
    setBusy(outcome)
    setError(null)
    const r = await api<{ status: string }>(`/api/payments/test/${id}`, { body: { outcome } })
    setBusy(null)
    if (!r.ok) return setError(r.error)
    router.push(`/account/funding/${id}?return=${r.data.status === 'SUCCEEDED' ? 'success' : 'failed'}`)
    router.refresh()
  }
  return (
    <div>
      <div className="flex items-start justify-between gap-4 border-b border-hairline pb-5">
        <div>
          <p className="text-[13px] text-muted">Pay {merchant}</p>
          <p className="num display mt-1 text-[34px] font-semibold">{usdFmt(amount)}</p>
          <p className="font-mono text-[13px] text-muted">{reference}</p>
        </div>
        <span className="rounded-sm bg-warn/10 px-2 py-1 text-[12px] font-semibold text-warn">TEST PAYMENT PAGE</span>
      </div>
      <p className="mt-5 text-[14px] leading-relaxed text-fg-2">
        This page stands in for the payment provider’s hosted checkout. Pick a test card to see how each outcome is handled. No card details are entered or stored.
      </p>
      {error && <Alert tone="loss" className="mt-4">{error}</Alert>}
      <div className="mt-5 space-y-2">
        {cards.map((c) => (
          <button
            key={c.outcome}
            disabled={!!busy}
            onClick={() => pay(c.outcome)}
            className="flex w-full items-center justify-between gap-4 rounded-md border border-hairline bg-surface px-4 py-3.5 text-left transition-colors hover:border-fg/30 disabled:opacity-50"
          >
            <span>
              <span className="block font-mono text-[14px] text-fg">{c.number}</span>
              <span className="text-[13px] text-muted">{c.label}</span>
            </span>
            <span className="text-[13px] font-medium text-fg">{busy === c.outcome ? 'Processing…' : `Pay ${usdFmt(amount)}`}</span>
          </button>
        ))}
      </div>
      <button onClick={() => router.push(`/account/funding/${id}`)} className="mt-5 text-[13px] text-muted underline hover:text-fg">
        Return without paying
      </button>
    </div>
  )
}
