'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Lock } from 'lucide-react'
import { Alert, Button, Field, Input, Select } from '@/components/ui'
import { useForm } from '@/components/use-form'
import { useToast } from '@/components/toast'
import { KYC_COUNTRIES, KYC_DOCUMENTS } from '@/lib/validation'

export function KycForm({ defaults }: { defaults: { legalName: string } }) {
  const router = useRouter()
  const toast = useToast()
  const [maxDob] = useState(() => new Date(Date.now() - 18 * 365.25 * 86_400_000).toISOString().slice(0, 10))
  const f = useForm({
    legalName: defaults.legalName,
    dateOfBirth: '',
    country: 'United States',
    addressLine1: '',
    city: '',
    postalCode: '',
    documentType: 'Passport',
    occupation: '',
    sourceOfFunds: 'Employment income',
    attest: false,
  })

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!f.values.attest) return f.setErrors({ attest: 'You must confirm this attestation' })
    if (await f.submit('/api/kyc', f.values)) {
      toast({ tone: 'success', title: 'Verification submitted', body: 'Our team will review it and notify you.' })
      router.refresh()
    }
  }
  const field = (k: keyof typeof f.values, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Field label={label} error={f.errors[k]} htmlFor={`kyc-${k}`}>
      <Input id={`kyc-${k}`} value={String(f.values[k])} onChange={(e) => f.set(k, e.target.value as never)} invalid={!!f.errors[k]} {...props} />
    </Field>
  )

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <section>
        <p className="eyebrow mb-4">Personal details</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('legalName', 'Full legal name', { autoComplete: 'name' })}
          {field('dateOfBirth', 'Date of birth', { type: 'date', max: maxDob })}
          {field('occupation', 'Occupation', { autoComplete: 'organization-title' })}
          <Field label="Primary source of funds" htmlFor="kyc-src">
            <Select id="kyc-src" value={f.values.sourceOfFunds} onChange={(e) => f.set('sourceOfFunds', e.target.value)}>
              {['Employment income', 'Savings', 'Investments', 'Other'].map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
        </div>
      </section>
      <section>
        <p className="eyebrow mb-4">Residential address</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{field('addressLine1', 'Street address', { autoComplete: 'address-line1' })}</div>
          {field('city', 'City', { autoComplete: 'address-level2' })}
          {field('postalCode', 'Postal code', { autoComplete: 'postal-code' })}
          <Field label="Country" htmlFor="kyc-country" className="sm:col-span-2">
            <Select id="kyc-country" value={f.values.country} onChange={(e) => f.set('country', e.target.value)}>
              {KYC_COUNTRIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
      </section>
      <section>
        <p className="eyebrow mb-4">Identity document type</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {KYC_DOCUMENTS.map((d) => (
            <label key={d} className={`cursor-pointer rounded-md border px-4 py-3 text-sm transition-colors ${f.values.documentType === d ? 'border-accent/50 bg-accent/[0.05] text-fg' : 'border-fg/[0.08] text-muted hover:text-fg'}`}>
              <input type="radio" name="doc" className="sr-only" checked={f.values.documentType === d} onChange={() => f.set('documentType', d)} />
              {d}
            </label>
          ))}
        </div>
        <Alert tone="info" icon={<Lock className="size-4" />} className="mt-4">
          We record which document you hold but never ask you to upload ID numbers, document photos or selfies through this website.
        </Alert>
      </section>
      <label className="flex items-start gap-3 text-sm text-muted">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-accent)]" checked={f.values.attest} onChange={(e) => f.set('attest', e.target.checked)} />
        I confirm the information above is accurate and I understand this is a simulated verification that does not create a real brokerage account.
      </label>
      {f.errors.attest && <p className="-mt-4 text-xs text-loss">{f.errors.attest}</p>}
      <Button type="submit" size="lg" loading={f.loading}>Submit for review</Button>
    </form>
  )
}
