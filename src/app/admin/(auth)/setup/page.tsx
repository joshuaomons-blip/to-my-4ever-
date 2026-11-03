import type { Metadata } from 'next'
import Link from 'next/link'
import { KeyRound } from 'lucide-react'
import { prisma } from '@/server/db'
import { AuthTitle } from '@/components/auth/auth-shell'
import { AdminSetupForm } from '@/components/auth/forms'
import { Alert } from '@/components/ui'

export const metadata: Metadata = { title: 'Initial setup', robots: { index: false } }

export default async function AdminSetupPage() {
  const done = (await prisma.user.count({ where: { role: 'SUPER_ADMIN' } })) > 0
  const configured = (process.env.ADMIN_SETUP_TOKEN ?? '').length >= 32
  return (
    <>
      <AuthTitle icon={<KeyRound className="mb-6 size-10 text-fg-2" />} title="Secure initial setup" subtitle="Create the first super administrator. This page permanently disables itself once complete." />
      {done ? (
        <Alert tone="neutral" title="Setup already completed">
          A super administrator exists. <Link href="/admin/login" className="underline">Sign in</Link> instead. Additional admins are created from the console.
        </Alert>
      ) : !configured ? (
        <Alert tone="warn" title="Setup token not configured">
          Set <code className="num">ADMIN_SETUP_TOKEN</code> (32+ random characters) in the server environment and restart, or run <code className="num">npm run admin:create</code>.
        </Alert>
      ) : (
        <AdminSetupForm />
      )}
    </>
  )
}
