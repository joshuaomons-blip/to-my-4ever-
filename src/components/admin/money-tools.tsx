'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui'
import { Modal } from '@/components/modal'
import { useForm } from '@/components/use-form'
import { useToast } from '@/components/toast'
import { api } from '@/lib/api'

export function ReverifyButton({ id }: { id: string }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true)
        const r = await api<{ providerStatus: string; outcome: string; message: string }>(`/api/admin/deposits/${id}/reverify`, { method: 'POST' })
        setBusy(false)
        if (r.ok) toast({ tone: 'success', title: `Provider reports: ${r.data.providerStatus}`, body: r.data.message })
        else toast({ tone: 'error', title: r.error })
        router.refresh()
      }}
    >
      Re-check with provider
    </Button>
  )
}

/** Test-mode only: make the test provider receive a bank transfer for a deposit reference. */
export function PaymentSimulator() {
  const router = useRouter()
  const toast = useToast()
  const f = useForm({ reference: '', amount: '', outcome: 'succeeded' })
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        const r = await f.submit<{ status: string; webhook: { outcome?: string } }>('/api/admin/payments/simulate', { reference: f.values.reference, amount: Number(f.values.amount), outcome: f.values.outcome })
        if (r) {
          toast({ tone: 'success', title: `Webhook ${r.webhook.outcome ?? 'delivered'}`, body: `Deposit is now ${r.status.toLowerCase().replace('_', ' ')}` })
          f.setValues({ reference: '', amount: '', outcome: 'succeeded' })
          router.refresh()
        }
      }}
    >
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Deposit reference" error={f.errors.reference} htmlFor="sim-ref">
          <Input id="sim-ref" placeholder="DEP-…" className="font-mono" value={f.values.reference} onChange={(e) => f.set('reference', e.target.value)} />
        </Field>
        <Field label="Amount received (USD)" error={f.errors.amount} htmlFor="sim-amt">
          <Input id="sim-amt" type="number" step="0.01" min="0" className="num" value={f.values.amount} onChange={(e) => f.set('amount', e.target.value)} />
        </Field>
        <Field label="Outcome" htmlFor="sim-out">
          <Select id="sim-out" value={f.values.outcome} onChange={(e) => f.set('outcome', e.target.value)}>
            <option value="succeeded">Transfer received</option>
            <option value="failed">Transfer returned</option>
          </Select>
        </Field>
      </div>
      <Button type="submit" variant="light" loading={f.loading}>Send test webhook</Button>
    </form>
  )
}

export function AdjustmentForm({ live, presetCustomer }: { live: boolean; presetCustomer?: string }) {
  const router = useRouter()
  const toast = useToast()
  const f = useForm({ customer: presetCustomer ?? '', direction: 'credit', amount: '', reason: '', evidence: '' })
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        const amt = Number(f.values.amount) * (f.values.direction === 'debit' ? -1 : 1)
        const r = await f.submit<{ reference: string; status: string }>('/api/admin/adjustments', { customer: f.values.customer, amount: amt, reason: f.values.reason, evidence: f.values.evidence || undefined })
        if (r) {
          toast({ tone: 'success', title: r.status === 'APPLIED' ? 'Correction applied' : 'Correction sent for approval', body: r.reference })
          f.setValues({ customer: presetCustomer ?? '', direction: 'credit', amount: '', reason: '', evidence: '' })
          router.refresh()
        }
      }}
    >
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      {!presetCustomer && (
        <Field label="Customer email" error={f.errors.customer} htmlFor="adj-c">
          <Input id="adj-c" type="email" value={f.values.customer} onChange={(e) => f.set('customer', e.target.value)} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" htmlFor="adj-dir">
          <Select id="adj-dir" value={f.values.direction} onChange={(e) => f.set('direction', e.target.value)}>
            <option value="credit">Credit (add cash)</option>
            <option value="debit">Debit (remove cash)</option>
          </Select>
        </Field>
        <Field label="Amount (USD)" error={f.errors.amount} htmlFor="adj-amt">
          <Input id="adj-amt" type="number" step="0.01" min="0" className="num" value={f.values.amount} onChange={(e) => f.set('amount', e.target.value)} />
        </Field>
      </div>
      <Field label="Reason (shown to the customer and kept in the audit log)" error={f.errors.reason} htmlFor="adj-r">
        <Textarea id="adj-r" rows={3} maxLength={500} value={f.values.reason} onChange={(e) => f.set('reason', e.target.value)} />
      </Field>
      <Field label={live ? 'Supporting reference (required)' : 'Supporting reference (optional)'} error={f.errors.evidence} htmlFor="adj-e" hint="Provider payment ID, bank statement line or support ticket number.">
        <Input id="adj-e" maxLength={200} value={f.values.evidence} onChange={(e) => f.set('evidence', e.target.value)} />
      </Field>
      <Alert tone={live ? 'warn' : 'neutral'}>
        {live
          ? 'Real-money records: this correction stays pending until a different administrator with approval rights approves it.'
          : 'Demo mode: the correction is applied to the simulated balance immediately and recorded as a ledger entry.'}
      </Alert>
      <Button type="submit" loading={f.loading}>{live ? 'Submit for approval' : 'Apply correction'}</Button>
    </form>
  )
}

export function AdjustmentDecision({ id, reference }: { id: string; reference: string }) {
  const router = useRouter()
  const toast = useToast()
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const f = useForm({ note: '' })
  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" variant="success" onClick={() => setDecision('approve')}>Approve</Button>
        <Button size="sm" variant="danger" onClick={() => setDecision('reject')}>Reject</Button>
      </div>
      <Modal open={!!decision} onClose={() => !f.loading && setDecision(null)} title={`${decision === 'approve' ? 'Approve' : 'Reject'} correction ${reference}`}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await f.submit(`/api/admin/adjustments/${id}`, { decision, note: f.values.note })) {
              toast({ tone: 'success', title: decision === 'approve' ? 'Correction applied' : 'Correction rejected' })
              setDecision(null)
              router.refresh()
            }
          }}
        >
          {f.error && <Alert tone="loss">{f.error}</Alert>}
          <Field label={decision === 'reject' ? 'Reason for rejection (required)' : 'Approval note (optional)'} error={f.errors.note} htmlFor="adj-note">
            <Textarea id="adj-note" value={f.values.note} onChange={(e) => f.set('note', e.target.value)} />
          </Field>
          <Button type="submit" variant={decision === 'approve' ? 'success' : 'danger'} loading={f.loading} className="w-full">
            Confirm {decision}
          </Button>
        </form>
      </Modal>
    </>
  )
}
