'use client'

import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Input } from '@/components/ui'
import { useForm } from '@/components/use-form'
import { useToast } from '@/components/toast'

export function ProfileForm({ initial, email }: { initial: { firstName: string; lastName: string; phone: string }; email: string }) {
  const router = useRouter()
  const toast = useToast()
  const f = useForm(initial)
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        if (await f.submit('/api/account/profile', f.values, 'PATCH')) {
          toast({ tone: 'success', title: 'Profile saved' })
          router.refresh()
        }
      }}
    >
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={f.errors.firstName} htmlFor="pf-fn"><Input id="pf-fn" value={f.values.firstName} onChange={(e) => f.set('firstName', e.target.value)} invalid={!!f.errors.firstName} /></Field>
        <Field label="Last name" error={f.errors.lastName} htmlFor="pf-ln"><Input id="pf-ln" value={f.values.lastName} onChange={(e) => f.set('lastName', e.target.value)} invalid={!!f.errors.lastName} /></Field>
      </div>
      <Field label="Email" hint="Contact support to change your email." htmlFor="pf-em"><Input id="pf-em" value={email} disabled /></Field>
      <Field label="Phone (optional)" error={f.errors.phone} htmlFor="pf-ph"><Input id="pf-ph" type="tel" autoComplete="tel" value={f.values.phone} onChange={(e) => f.set('phone', e.target.value)} invalid={!!f.errors.phone} /></Field>
      <Button type="submit" loading={f.loading} variant="light">Save profile</Button>
    </form>
  )
}
