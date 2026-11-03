import Link from 'next/link'
import { MailWarning, Wrench } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { getSettings } from '@/server/settings'
import { paymentsConfig } from '@/server/payments/config'
import { SandboxStrip } from '@/components/brand'
import { AccountHeader } from '@/components/app/shell'
import { ResendVerification } from '@/components/app/resend-verification'
import { SiteFooter } from '@/components/site/footer'
import { mailboxEnabled } from '@/server/mailer'

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomerPage()
  const [settings, notifications, kyc, account] = await Promise.all([
    getSettings(),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.kycSubmission.findUnique({ where: { userId: user.id }, select: { status: true } }),
    prisma.account.findUnique({ where: { userId: user.id }, select: { accountNumber: true } }),
  ])
  const badges: Record<string, string> = kyc?.status === 'APPROVED' ? {} : { '/account/kyc': kyc?.status === 'PENDING' ? 'In review' : 'Required' }
  return (
    <div className="flex min-h-dvh flex-col">
      <SandboxStrip live={paymentsConfig().livemode} />
      <AccountHeader
        branding={settings.branding}
        badges={badges}
        user={{ name: `${user.firstName} ${user.lastName}`, email: user.email, subtitle: account?.accountNumber ?? user.email }}
        notifications={notifications.map((n) => ({ ...n, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))}
      />
      {settings.maintenance.enabled && (
        <div className="flex items-center justify-center gap-2 border-b border-warn/25 bg-warn/[0.07] px-4 py-2.5 text-center text-[13px] text-warn">
          <Wrench className="size-4" /> {settings.maintenance.message}
        </div>
      )}
      {!user.emailVerifiedAt && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-hairline bg-surface-2 px-4 py-2.5 text-center text-[14px] text-fg-2">
          <MailWarning className="size-4 text-warn" /> Confirm your email address to add funds.
          <ResendVerification />
          {mailboxEnabled() && <Link href="/dev/mailbox" className="text-muted underline hover:text-fg">Open test mailbox</Link>}
        </div>
      )}
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 sm:px-8 sm:py-10">{children}</main>
      <SiteFooter branding={settings.branding} support={settings.support} />
    </div>
  )
}
