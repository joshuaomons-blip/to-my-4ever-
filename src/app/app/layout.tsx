import Link from 'next/link'
import { MailWarning, Wrench } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { getSettings } from '@/server/settings'
import { AppShell } from '@/components/app/shell'
import { ResendVerification } from '@/components/app/resend-verification'

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomerPage()
  const [settings, notifications, kyc, account] = await Promise.all([
    getSettings(),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.kycSubmission.findUnique({ where: { userId: user.id }, select: { status: true } }),
    prisma.account.findUnique({ where: { userId: user.id }, select: { accountNumber: true } }),
  ])
  const badges: Record<string, string> = kyc?.status === 'APPROVED' ? {} : { '/app/kyc': kyc?.status === 'PENDING' ? 'Review' : 'Start' }
  return (
    <>
      <AppShell
        branding={settings.branding}
        badges={badges}
        user={{ name: `${user.firstName} ${user.lastName}`, email: user.email, subtitle: account?.accountNumber ?? user.email }}
        notifications={notifications.map((n) => ({ ...n, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))}
        banner={
          <>
            {settings.maintenance.enabled && (
              <div className="flex items-center justify-center gap-2 border-b border-warn/20 bg-warn/[0.08] px-4 py-2.5 text-center text-xs text-warn">
                <Wrench className="size-3.5" /> {settings.maintenance.message}
              </div>
            )}
            {!user.emailVerifiedAt && (
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-center text-xs text-silver">
                <MailWarning className="size-3.5 text-warn" /> Verify your email to unlock sandbox funding.
                <ResendVerification />
                <Link href="/dev/mailbox" className="text-mute underline hover:text-white">Open sandbox mailbox</Link>
              </div>
            )}
          </>
        }
      >
        {children}
      </AppShell>
    </>
  )
}
