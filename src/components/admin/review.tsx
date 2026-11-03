'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Alert, Button, Field, Textarea } from '@/components/ui'
import { Modal } from '@/components/modal'
import { useForm } from '@/components/use-form'
import { useToast } from '@/components/toast'

/** Approve / reject controls for KYC submissions and withdrawal requests. */
export function ReviewButtons({ kind, endpoint, subject }: { kind: 'kyc' | 'withdrawal'; endpoint: string; subject: string }) {
  const router = useRouter()
  const toast = useToast()
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const f = useForm({ reason: '', note: '' })
  const close = () => {
    if (f.loading) return
    setDecision(null)
    f.setValues({ reason: '', note: '' })
    f.setError(null)
    f.setErrors({})
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const body = kind === 'kyc' ? { decision, reason: f.values.reason, note: f.values.note } : { decision, note: f.values.note }
    if (await f.submit(endpoint, body)) {
      toast({ tone: 'success', title: `${kind === 'kyc' ? 'Verification' : 'Withdrawal'} ${decision === 'approve' ? 'approved' : 'rejected'}`, body: subject })
      close()
      router.refresh()
    }
  }
  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" variant="success" onClick={() => setDecision('approve')}><Check className="size-3.5" /> Approve</Button>
        <Button size="sm" variant="danger" onClick={() => setDecision('reject')}><X className="size-3.5" /> Reject</Button>
      </div>
      <Modal open={!!decision} onClose={close} title={`${decision === 'approve' ? 'Approve' : 'Reject'} ${kind === 'kyc' ? 'verification' : 'withdrawal'}`}>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted">{subject}</p>
          {f.error && <Alert tone="loss">{f.error}</Alert>}
          {kind === 'kyc' && decision === 'reject' && (
            <Field label="Reason shown to customer (required)" error={f.errors.reason} htmlFor="rv-reason">
              <Textarea id="rv-reason" maxLength={300} value={f.values.reason} onChange={(e) => f.set('reason', e.target.value)} placeholder="e.g. Name does not match account holder" />
            </Field>
          )}
          <Field label={kind === 'withdrawal' && decision === 'reject' ? 'Administrative note (required)' : 'Internal review note (optional)'} error={f.errors.note} htmlFor="rv-note" hint={kind === 'withdrawal' ? 'Shown to the customer and stored in the audit trail.' : 'Visible to administrators only.'}>
            <Textarea id="rv-note" maxLength={1000} value={f.values.note} onChange={(e) => f.set('note', e.target.value)} />
          </Field>
          {kind === 'withdrawal' && decision === 'approve' && <Alert tone="info">Approving pays the withdrawal out: in test mode it is simulated; with live payments it is refunded to the customer’s original payment method through the provider.</Alert>}
          {kind === 'withdrawal' && decision === 'reject' && <Alert tone="warn">Rejecting returns the reserved funds to the customer’s cash balance.</Alert>}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={f.loading}>Cancel</Button>
            <Button type="submit" variant={decision === 'approve' ? 'success' : 'danger'} loading={f.loading}>Confirm {decision}</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
