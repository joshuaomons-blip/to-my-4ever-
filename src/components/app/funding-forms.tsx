'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Building2, CircleCheck, CreditCard, Landmark, ShieldCheck } from 'lucide-react'
import { Alert, Button, Field, Input, Textarea } from '@/components/ui'
import { Modal } from '@/components/modal'
import { useToast } from '@/components/toast'
import { useForm } from '@/components/use-form'
import { api } from '@/lib/api'
import { cn, usdFmt } from '@/lib/format'

const METHODS = [
  { id: 'Sandbox ACH transfer', icon: Landmark, title: 'ACH transfer', sub: 'Settles in seconds (simulated)' },
  { id: 'Sandbox wire transfer', icon: Building2, title: 'Wire transfer', sub: 'Same flow, larger amounts' },
  { id: 'Sandbox debit card', icon: CreditCard, title: 'Debit card', sub: 'Simulated instant card' },
]

/** Re-renders the page while sandbox deposits are settling. */
export function AutoRefresh({ active, everyMs = 4000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => router.refresh(), everyMs)
    return () => clearInterval(id)
  }, [active, everyMs, router])
  return null
}

export function DepositForm({ min, max, settlementSeconds, disabledReason }: { min: number; max: number; settlementSeconds: number; disabledReason?: string }) {
  const router = useRouter()
  const toast = useToast()
  const f = useForm({ amount: '', method: METHODS[0].id })
  const [confirm, setConfirm] = useState(false)
  const amount = Number(f.values.amount)
  const localError = f.values.amount && (amount < min ? `Minimum is ${usdFmt(min)}` : amount > max ? `Maximum is ${usdFmt(max)}` : null)

  async function submit() {
    const res = await f.submit<{ transaction: { reference: string; status: string } }>('/api/funding/deposit', { amount, method: f.values.method })
    setConfirm(false)
    if (!res) return
    toast({ tone: 'success', title: res.transaction.status === 'COMPLETED' ? 'Virtual funds added' : 'Deposit initiated', body: `${usdFmt(amount)} · ${res.transaction.reference}` })
    f.set('amount', '')
    router.refresh()
  }

  if (disabledReason) return <Alert tone="warn" title="Funding unavailable">{disabledReason}</Alert>

  return (
    <div className="space-y-5">
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <Field label="Amount (virtual USD)" error={localError || f.errors.amount} htmlFor="dep-amt" hint={`Between ${usdFmt(min)} and ${usdFmt(max)} per deposit`}>
        <div className="relative">
          <span className="num pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl text-dim">$</span>
          <Input id="dep-amt" type="number" inputMode="decimal" min={min} max={max} step="0.01" placeholder="0.00" className="num h-14 pl-9 text-xl" value={f.values.amount} onChange={(e) => f.set('amount', e.target.value)} invalid={!!(localError || f.errors.amount)} />
        </div>
      </Field>
      <div className="flex flex-wrap gap-2">
        {[1000, 5000, 10000, 25000].filter((v) => v <= max).map((v) => (
          <button key={v} type="button" onClick={() => f.set('amount', String(v))} className="num rounded-full border border-white/[0.08] px-3 py-1 text-xs text-mute hover:border-white/20 hover:text-white">{usdFmt(v).replace('.00', '')}</button>
        ))}
      </div>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-silver">Sandbox funding method</legend>
        <div className="grid gap-2">
          {METHODS.map((m) => (
            <label key={m.id} className={cn('flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition-all', f.values.method === m.id ? 'border-accent/50 bg-accent/[0.05]' : 'border-white/[0.08] hover:border-white/15')}>
              <input type="radio" name="method" className="sr-only" checked={f.values.method === m.id} onChange={() => f.set('method', m.id)} />
              <span className="grid size-10 place-items-center rounded-xl bg-white/[0.04] text-silver"><m.icon className="size-[18px]" /></span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{m.title}</span>
                <span className="block text-[11px] text-dim">{m.sub}</span>
              </span>
              <span className={cn('size-4 rounded-full border-2', f.values.method === m.id ? 'border-accent bg-accent shadow-[inset_0_0_0_2px_#151515]' : 'border-white/20')} />
            </label>
          ))}
        </div>
      </fieldset>
      <Alert tone="neutral" icon={<ShieldCheck className="size-4 text-silver" />}>
        No bank account or card details are requested or stored. Sandbox deposits create virtual money only.
      </Alert>
      <Button size="lg" className="w-full" disabled={!amount || !!localError} onClick={() => setConfirm(true)}>Continue</Button>

      <Modal open={confirm} onClose={() => !f.loading && setConfirm(false)} title="Confirm sandbox deposit">
        <div className="space-y-5">
          <div className="rounded-2xl border border-white/[0.08] bg-ink/60 p-5 text-center">
            <p className="eyebrow">Virtual deposit</p>
            <p className="num mt-2 text-3xl">{usdFmt(amount)}</p>
            <p className="mt-1 text-xs text-dim">{f.values.method}</p>
          </div>
          <p className="text-sm text-mute">Funds will be marked <span className="text-warn">pending</span> and settle automatically in about {settlementSeconds} seconds to simulate clearing.</p>
          {f.error && <Alert tone="loss">{f.error}</Alert>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)} disabled={f.loading}>Cancel</Button>
            <Button onClick={submit} loading={f.loading}>Confirm deposit</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export function WithdrawForm({ cash, min, disabledReason }: { cash: number; min: number; disabledReason?: string }) {
  const router = useRouter()
  const toast = useToast()
  const f = useForm({ amount: '', note: '' })
  const [confirm, setConfirm] = useState(false)
  const amount = Number(f.values.amount)
  const localError = f.values.amount && (amount < min ? `Minimum is ${usdFmt(min)}` : amount > cash ? `Exceeds available cash (${usdFmt(cash)})` : null)

  async function submit() {
    const res = await f.submit<{ transaction: { reference: string } }>('/api/funding/withdraw', { amount, note: f.values.note || undefined })
    setConfirm(false)
    if (!res) return
    toast({ tone: 'success', title: 'Withdrawal requested', body: `${usdFmt(amount)} · ${res.transaction.reference} is awaiting review.` })
    f.setValues({ amount: '', note: '' })
    router.refresh()
  }

  if (disabledReason) return <Alert tone="warn" title="Withdrawals unavailable">{disabledReason}</Alert>

  return (
    <div className="space-y-5">
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <Field label="Amount (virtual USD)" error={localError || f.errors.amount} htmlFor="wd-amt" hint={`Available: ${usdFmt(cash)} · minimum ${usdFmt(min)}`}>
        <div className="relative">
          <span className="num pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl text-dim">$</span>
          <Input id="wd-amt" type="number" inputMode="decimal" min={min} step="0.01" placeholder="0.00" className="num h-14 pl-9 text-xl" value={f.values.amount} onChange={(e) => f.set('amount', e.target.value)} invalid={!!(localError || f.errors.amount)} />
          <button type="button" onClick={() => f.set('amount', (Math.floor(cash * 100) / 100).toString())} className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-silver hover:bg-white/10">Max</button>
        </div>
      </Field>
      <Field label="Note (optional)" htmlFor="wd-note" error={f.errors.note}>
        <Textarea id="wd-note" maxLength={200} placeholder="Anything the reviewer should know" value={f.values.note} onChange={(e) => f.set('note', e.target.value)} className="min-h-20" />
      </Field>
      <Button size="lg" className="w-full" disabled={!amount || !!localError} onClick={() => setConfirm(true)}>Request withdrawal</Button>
      <p className="text-[11px] leading-relaxed text-dim">Funds are reserved immediately and reviewed by an administrator. If rejected or cancelled, they return to your cash balance. No money leaves the sandbox.</p>

      <Modal open={confirm} onClose={() => !f.loading && setConfirm(false)} title="Confirm withdrawal request">
        <div className="space-y-5">
          <div className="rounded-2xl border border-white/[0.08] bg-ink/60 p-5 text-center">
            <p className="eyebrow">Simulated withdrawal</p>
            <p className="num mt-2 text-3xl">{usdFmt(amount)}</p>
            <p className="mt-1 text-xs text-dim">Sandbox ACH transfer · requires admin approval</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)} disabled={f.loading}>Cancel</Button>
            <Button onClick={submit} loading={f.loading}>Submit request</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export function CancelWithdrawalButton({ id }: { id: string }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={busy}
      onClick={async () => {
        if (!window.confirm('Cancel this withdrawal request? The funds will return to your cash balance.')) return
        setBusy(true)
        const r = await api(`/api/funding/withdraw/${id}/cancel`, { method: 'POST' })
        setBusy(false)
        if (r.ok) {
          toast({ tone: 'success', title: 'Withdrawal cancelled' })
          router.refresh()
        } else toast({ tone: 'error', title: r.error })
      }}
    >
      Cancel
    </Button>
  )
}

export function SettledCheck() {
  return <CircleCheck className="size-4 text-gain" />
}
