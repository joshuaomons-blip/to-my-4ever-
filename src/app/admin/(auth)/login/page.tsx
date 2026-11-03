import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShieldHalf } from 'lucide-react'
import { prisma } from '@/server/db'
import { getCurrentUser } from '@/server/auth/session'
import { AuthTitle } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/forms'
import { Alert } from '@/components/ui'

export const metadata: Metadata = { title: 'Administrator sign in', robots: { index: false } }

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const sp = await searchParams
  if (await getCurrentUser('admin')) redirect('/admin')
  const needsSetup = (await prisma.user.count({ where: { role: 'SUPER_ADMIN' } })) === 0
  return (
    <>
      <AuthTitle icon={<ShieldHalf className="mb-6 size-10 text-silver" />} title="Administrator sign in" subtitle="Authorised personnel only. Customer accounts cannot sign in here." />
      {needsSetup && (
        <Alert tone="warn" className="mb-4" title="No administrator yet">
          Complete the one-time <Link href="/admin/setup" className="underline">secure setup</Link> using the server’s ADMIN_SETUP_TOKEN.
        </Alert>
      )}
      {sp.reset && <Alert tone="gain" className="mb-4">Password updated. Sign in again.</Alert>}
      <LoginForm scope="admin" />
    </>
  )
}
