import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { getPendingMfa } from '@/server/auth/session'
import { AuthTitle } from '@/components/auth/auth-shell'
import { MfaForm } from '@/components/auth/forms'

export const metadata: Metadata = { title: 'Two-factor authentication' }

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  if (!(await getPendingMfa('customer'))) redirect('/login')
  return (
    <>
      <AuthTitle icon={<ShieldCheck className="mb-6 size-10 text-accent" />} title="Two-factor authentication" subtitle="Enter the 6-digit code from your authenticator app." />
      <MfaForm scope="customer" next={next} />
    </>
  )
}
