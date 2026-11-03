import type { Metadata } from 'next'
import { MailCheck } from 'lucide-react'
import { AuthTitle } from '@/components/auth/auth-shell'
import { VerifyEmail } from '@/components/auth/forms'

export const metadata: Metadata = { title: 'Verify email' }

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return (
    <>
      <AuthTitle icon={<MailCheck className="mb-6 size-10 text-accent" />} title="Email verification" />
      <VerifyEmail token={token ?? ''} />
    </>
  )
}
