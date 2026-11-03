import { prisma } from '@/server/db'
import { getCurrentUser } from '@/server/auth/session'
import { effectivePermissions } from '@/server/auth/permissions'
import { getSettings } from '@/server/settings'
import { redirect } from 'next/navigation'
import { AdminShell } from '@/components/admin/shell'

export const metadata = { robots: { index: false, follow: false } }

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser('admin')
  if (!user) redirect('/admin/login')
  const [settings, pendingKyc, pendingWd] = await Promise.all([
    getSettings(),
    prisma.kycSubmission.count({ where: { status: 'PENDING' } }),
    prisma.transaction.count({ where: { type: 'WITHDRAWAL', status: 'PENDING' } }),
  ])
  return (
    <AdminShell
      branding={settings.branding}
      permissions={effectivePermissions(user)}
      badges={{ '/admin/kyc': pendingKyc, '/admin/withdrawals': pendingWd }}
      user={{ name: `${user.firstName} ${user.lastName}`, email: user.email, role: user.role }}
    >
      {children}
    </AdminShell>
  )
}
