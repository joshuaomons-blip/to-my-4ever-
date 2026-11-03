import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { getPendingMfa } from '@/server/auth/session'
import { AuthTitle } from '@/components/auth/auth-shell'
import { MfaForm } from '@/components/auth/forms'

export const metadata: Metadata = { title: 'Admin verification', robots: { index: false } }

export default async function AdminMfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  if (!(await getPendingMfa('admin'))) redirect('/admin/login')
  return (
    <>
      <AuthTitle icon={<ShieldCheck className="mb-6 size-10 text-silver" />} title="Verify it’s you" subtitle="Enter the 6-digit code from your authenticator app." />
      <MfaForm scope="admin" next={next} />
    </>
  )
}
