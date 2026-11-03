'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Ban, Flag, FlagOff, LogOut, MessageSquarePlus, RotateCcw } from 'lucide-react'
import { Alert, Button, Field, Textarea } from '@/components/ui'
import { Modal } from '@/components/modal'
import { useForm } from '@/components/use-form'
import { useToast } from '@/components/toast'
import { api } from '@/lib/api'

/** A button that opens a modal asking for a reason/note, then posts it. */
export function ReasonAction({
  label,
  icon,
  title,
  description,
  endpoint,
  payload,
  field = 'reason',
  required = true,
  variant = 'ghost',
  confirmLabel,
  confirmVariant = 'primary',
  successMessage,
  placeholder,
}: {
  label: string
  icon?: React.ReactNode
  title: string
  description?: string
  endpoint: string
  payload: Record<string, unknown>
  field?: string
  required?: boolean
  variant?: 'ghost' | 'danger' | 'success' | 'light' | 'primary' | 'subtle'
  confirmLabel?: string
  confirmVariant?: 'primary' | 'danger' | 'success' | 'light'
  successMessage: string
  placeholder?: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const f = useForm({ text: '' })
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>{icon}{label}</Button>
      <Modal open={open} onClose={() => !f.loading && setOpen(false)} title={title}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (required && f.values.text.trim().length < 3) return f.setErrors({ [field]: 'Please add at least a few words' })
            const res = await f.submit(endpoint, { ...payload, [field]: f.values.text.trim() })
            if (res) {
              toast({ tone: 'success', title: successMessage })
              setOpen(false)
              f.set('text', '')
              router.refresh()
            }
          }}
        >
          {description && <p className="text-sm text-mute">{description}</p>}
          {f.error && <Alert tone="loss">{f.error}</Alert>}
          <Field label={required ? 'Reason (required, recorded in audit log)' : 'Note (optional, recorded in audit log)'} error={f.errors[field]} htmlFor="reason-text">
            <Textarea id="reason-text" maxLength={500} value={f.values.text} onChange={(e) => f.set('text', e.target.value)} placeholder={placeholder} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={f.loading}>Cancel</Button>
            <Button type="submit" variant={confirmVariant} loading={f.loading}>{confirmLabel ?? label}</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

export function CustomerActions({ id, status, flagged }: { id: string; status: string; flagged: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-wrap gap-2">
      {status === 'ACTIVE' ? (
        <ReasonAction label="Suspend" icon={<Ban className="size-3.5" />} variant="danger" confirmVariant="danger" title="Suspend customer account" description="The customer will be signed out immediately and cannot sign in, trade or move funds until reactivated." endpoint={`/api/admin/customers/${id}/status`} payload={{ action: 'suspend' }} successMessage="Account suspended" confirmLabel="Suspend account" />
      ) : (
        <ReasonAction label="Reactivate" icon={<RotateCcw className="size-3.5" />} variant="success" confirmVariant="success" title="Reactivate account" endpoint={`/api/admin/customers/${id}/status`} payload={{ action: 'reactivate' }} required={false} successMessage="Account reactivated" />
      )}
      {flagged ? (
        <ReasonAction label="Clear flag" icon={<FlagOff className="size-3.5" />} title="Clear suspicious-activity flag" endpoint={`/api/admin/customers/${id}/flag`} payload={{ flagged: false }} required={false} successMessage="Flag cleared" />
      ) : (
        <ReasonAction label="Flag activity" icon={<Flag className="size-3.5" />} title="Flag suspicious activity" description="Flagged customers are highlighted for other reviewers. This does not restrict the account." endpoint={`/api/admin/customers/${id}/flag`} payload={{ flagged: true }} successMessage="Customer flagged" placeholder="e.g. Rapid deposit and withdrawal cycling" />
      )}
      <ReasonAction label="Add note" icon={<MessageSquarePlus className="size-3.5" />} title="Add internal note" description="Notes are visible to administrators only." endpoint={`/api/admin/customers/${id}/notes`} payload={{ context: 'customer' }} field="body" successMessage="Note added" />
      <Button
        size="sm"
        variant="ghost"
        loading={busy}
        onClick={async () => {
          if (!window.confirm('Sign this customer out of all devices?')) return
          setBusy(true)
          const r = await api<{ count: number }>(`/api/admin/customers/${id}/revoke-sessions`, { method: 'POST' })
          setBusy(false)
          if (r.ok) {
            toast({ tone: 'success', title: `Revoked ${r.data.count} session(s)` })
            router.refresh()
          } else toast({ tone: 'error', title: r.error })
        }}
      >
        <LogOut className="size-3.5" /> Force sign-out
      </Button>
    </div>
  )
}
