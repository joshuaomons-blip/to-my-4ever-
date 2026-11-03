import type { Metadata } from 'next'
import { Clock, Mail, Phone } from 'lucide-react'
import { getSettings } from '@/server/settings'
import { Alert, Card } from '@/components/ui'

export const metadata: Metadata = { title: 'Support' }

export default async function SupportPage() {
  const { support } = await getSettings()
  return (
    <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="eyebrow">Support</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">We’re here to help.</h1>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          [Mail, 'Email', support.email, `mailto:${support.email}`],
          [Phone, 'Phone', support.phone, `tel:${support.phone.replace(/[^+\d]/g, '')}`],
          [Clock, 'Hours', support.hours, null],
        ].map(([Icon, label, value, href]) => {
          const I = Icon as typeof Mail
          return (
            <Card key={label as string} className="p-6">
              <I className="size-5 text-accent" />
              <p className="eyebrow mt-5">{label as string}</p>
              {href ? <a href={href as string} className="mt-1.5 block text-sm text-white hover:underline">{value as string}</a> : <p className="mt-1.5 text-sm text-white">{value as string}</p>}
            </Card>
          )
        })}
      </div>
      {support.note && <Alert tone="info" className="mt-6">{support.note}</Alert>}
    </div>
  )
}
