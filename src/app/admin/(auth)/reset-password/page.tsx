import type { Metadata } from 'next'
import { AuthTitle } from '@/components/auth/auth-shell'
import { ResetForm } from '@/components/auth/forms'

export const metadata: Metadata = { title: 'Admin password reset', robots: { index: false } }

export default async function AdminResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return (
    <>
      <AuthTitle title="Choose a new password" subtitle="All of your sessions will be signed out." />
      <ResetForm scope="admin" token={token ?? ''} />
    </>
  )
}
