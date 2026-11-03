import type { Metadata } from 'next'
import { AuthTitle } from '@/components/auth/auth-shell'
import { ResetForm } from '@/components/auth/forms'

export const metadata: Metadata = { title: 'Choose a new password' }

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return (
    <>
      <AuthTitle title="Choose a new password" subtitle="This signs you out of all other sessions." />
      <ResetForm scope="customer" token={token ?? ''} />
    </>
  )
}
