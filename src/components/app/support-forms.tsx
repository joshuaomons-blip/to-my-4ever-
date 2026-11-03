'use client'

import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui'
import { useForm } from '@/components/use-form'
import { useToast } from '@/components/toast'
import { TICKET_CATEGORIES } from '@/lib/validation'

export function NewTicketForm() {
  const router = useRouter()
  const toast = useToast()
  const f = useForm({ subject: '', category: 'Funding', message: '' })
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        const r = await f.submit<{ id: string; reference: string }>('/api/support/tickets', f.values)
        if (r) {
          toast({ tone: 'success', title: 'Request sent', body: `Reference ${r.reference}. We’ll reply here and notify you.` })
          router.push(`/account/support/${r.id}`)
        }
      }}
    >
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <Field label="Topic" htmlFor="tk-cat">
        <Select id="tk-cat" value={f.values.category} onChange={(e) => f.set('category', e.target.value)}>
          {TICKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="Subject" error={f.errors.subject} htmlFor="tk-sub">
        <Input id="tk-sub" maxLength={120} value={f.values.subject} onChange={(e) => f.set('subject', e.target.value)} invalid={!!f.errors.subject} />
      </Field>
      <Field label="How can we help?" error={f.errors.message} htmlFor="tk-msg" hint="Include any deposit or transaction reference. Never send passwords or full card numbers.">
        <Textarea id="tk-msg" rows={6} maxLength={4000} value={f.values.message} onChange={(e) => f.set('message', e.target.value)} invalid={!!f.errors.message} />
      </Field>
      <Button type="submit" loading={f.loading}>Send request</Button>
    </form>
  )
}

export function TicketReply({ endpoint, statusEndpoint, closed, staff }: { endpoint: string; statusEndpoint: string; closed: boolean; staff?: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const f = useForm({ body: '' })
  async function setStatus(status: 'OPEN' | 'CLOSED') {
    if (await f.submit(statusEndpoint, { status })) {
      toast({ tone: 'success', title: status === 'CLOSED' ? 'Request closed' : 'Request reopened' })
      router.refresh()
    }
  }
  if (closed && !staff)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">This request is closed.</p>
        <Button variant="ghost" size="sm" onClick={() => setStatus('OPEN')} loading={f.loading}>Reopen request</Button>
      </div>
    )
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await f.submit(endpoint, f.values)) {
          f.set('body', '')
          toast({ tone: 'success', title: 'Reply sent' })
          router.refresh()
        }
      }}
    >
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <Field label={staff ? 'Reply to customer' : 'Your reply'} error={f.errors.body} htmlFor="tk-reply">
        <Textarea id="tk-reply" rows={4} maxLength={4000} value={f.values.body} onChange={(e) => f.set('body', e.target.value)} invalid={!!f.errors.body} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={f.loading}>Send reply</Button>
        <Button type="button" variant="ghost" onClick={() => setStatus(closed ? 'OPEN' : 'CLOSED')}>
          {closed ? 'Reopen request' : staff ? 'Close request' : 'Mark as resolved'}
        </Button>
      </div>
    </form>
  )
}
