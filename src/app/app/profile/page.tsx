import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { getSessionId, requireCustomerPage } from '@/server/auth/session'
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui'
import { ProfileForm } from '@/components/app/profile-form'
import { ChangePasswordForm, MfaCard, SessionsList } from '@/components/security'
import { dateFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Profile & security' }

export default async function ProfilePage() {
  const user = await requireCustomerPage()
  const [sessions, currentId, account] = await Promise.all([
    prisma.session.findMany({ where: { userId: user.id, mfaPending: false }, orderBy: { lastSeenAt: 'desc' } }),
    getSessionId('customer'),
    prisma.account.findUnique({ where: { userId: user.id } }),
  ])
  return (
    <>
      <PageHeader eyebrow="Account" title="Profile & security" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Personal information" subtitle={`Member since ${dateFmt(user.createdAt)} · ${account?.accountNumber}`} action={user.emailVerifiedAt ? <Badge tone="gain" dot>Email verified</Badge> : <Badge tone="warn" dot>Email unverified</Badge>} />
          <div className="p-6"><ProfileForm initial={{ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? '' }} email={user.email} /></div>
        </Card>
        <Card>
          <CardHeader title="Change password" subtitle="Changing your password signs out your other sessions" />
          <div className="p-6"><ChangePasswordForm endpoint="/api/account/password" /></div>
        </Card>
        <Card>
          <CardHeader title="Two-factor authentication" />
          <div className="p-6"><MfaCard apiBase="/api/account" enabled={user.totpEnabled} /></div>
        </Card>
        <Card>
          <CardHeader title="Active sessions" subtitle="Devices currently signed in to your account" />
          <div className="px-6 pb-6"><SessionsList endpoint="/api/account/sessions" currentId={currentId} sessions={sessions.map((s) => ({ id: s.id, ip: s.ip, userAgent: s.userAgent, lastSeenAt: s.lastSeenAt.toISOString(), createdAt: s.createdAt.toISOString() }))} /></div>
        </Card>
      </div>
    </>
  )
}
