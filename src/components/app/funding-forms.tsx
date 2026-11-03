'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Alert, Button, Field, Input, Textarea } from '@/components/ui'
import { Modal } from '@/components/modal'
import { useToast } from '@/components/toast'
import { useForm } from '@/components/use-form'
import { api } from '@/lib/api'
import { usdFmt } from '@/lib/format'

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
      <Field label="Amount (USD)" error={localError || f.errors.amount} htmlFor="wd-amt" hint={`Available: ${usdFmt(cash)} · minimum ${usdFmt(min)}`}>
        <div className="relative">
          <span className="num pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl text-faint">$</span>
          <Input id="wd-amt" type="number" inputMode="decimal" min={min} step="0.01" placeholder="0.00" className="num h-14 pl-9 text-xl" value={f.values.amount} onChange={(e) => f.set('amount', e.target.value)} invalid={!!(localError || f.errors.amount)} />
          <button type="button" onClick={() => f.set('amount', (Math.floor(cash * 100) / 100).toString())} className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-fg/[0.06] px-2.5 py-1 text-[11px] text-fg-2 hover:bg-fg/10">Max</button>
        </div>
      </Field>
      <Field label="Note (optional)" htmlFor="wd-note" error={f.errors.note}>
        <Textarea id="wd-note" maxLength={200} placeholder="Anything the reviewer should know" value={f.values.note} onChange={(e) => f.set('note', e.target.value)} className="min-h-20" />
      </Field>
      <Button size="lg" className="w-full" disabled={!amount || !!localError} onClick={() => setConfirm(true)}>Request withdrawal</Button>
      <p className="text-[11px] leading-relaxed text-faint">The amount is set aside from your cash straight away and reviewed by our team. If the request is rejected or you cancel it, the money returns to your cash balance.</p>

      <Modal open={confirm} onClose={() => !f.loading && setConfirm(false)} title="Confirm withdrawal request">
        <div className="space-y-5">
          <div className="rounded-lg border border-fg/[0.08] bg-canvas/60 p-5 text-center">
            <p className="eyebrow">Withdrawal</p>
            <p className="num mt-2 text-3xl">{usdFmt(amount)}</p>
            <p className="mt-1 text-xs text-faint">Reviewed by our team before it is paid out</p>
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
