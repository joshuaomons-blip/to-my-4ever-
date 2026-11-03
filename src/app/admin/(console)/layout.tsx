import { redirect } from 'next/navigation'
import { prisma } from '@/server/db'
import { getCurrentUser } from '@/server/auth/session'
import { effectivePermissions } from '@/server/auth/permissions'
import { getSettings } from '@/server/settings'
import { paymentsConfig } from '@/server/payments/config'
import { AdminShell } from '@/components/admin/shell'

export const metadata = { robots: { index: false, follow: false } }

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser('admin')
  if (!user) redirect('/admin/login')
  const [settings, pendingKyc, pendingWd, openTickets, pendingAdj] = await Promise.all([
    getSettings(),
    prisma.kycSubmission.count({ where: { status: 'PENDING' } }),
    prisma.transaction.count({ where: { type: 'WITHDRAWAL', status: 'PENDING' } }),
    prisma.supportTicket.count({ where: { status: 'OPEN' } }),
    prisma.ledgerAdjustment.count({ where: { status: 'PENDING_APPROVAL' } }),
  ])
  const cfg = paymentsConfig()
  const modeLabel = cfg.provider === 'test' ? 'Test mode' : cfg.livemode ? (cfg.status === 'ready' ? 'Live payments' : 'Live payments blocked') : 'Stripe test mode'
  return (
    <AdminShell
      branding={settings.branding}
      permissions={effectivePermissions(user)}
      badges={{ '/admin/kyc': pendingKyc, '/admin/withdrawals': pendingWd, '/admin/support': openTickets, '/admin/adjustments': pendingAdj }}
      user={{ name: `${user.firstName} ${user.lastName}`, email: user.email, role: user.role }}
      modeLabel={modeLabel}
      live={cfg.livemode && cfg.status === 'ready'}
    >
      {children}
    </AdminShell>
  )
}
