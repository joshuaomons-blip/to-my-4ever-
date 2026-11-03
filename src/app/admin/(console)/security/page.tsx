import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { getSessionId, requireAdminPage } from '@/server/auth/session'
import { effectivePermissions } from '@/server/auth/permissions'
import { getSettings } from '@/server/settings'
import { Alert, Badge, Card, CardHeader, PageHeader } from '@/components/ui'
import { ChangePasswordForm, MfaCard, SessionsList } from '@/components/security'

export const metadata: Metadata = { title: 'My security' }

export default async function AdminSecurityPage({ searchParams }: { searchParams: Promise<{ setup?: string; welcome?: string }> }) {
  const me = await requireAdminPage(undefined, { allowMfaSetup: true })
  const sp = await searchParams
  const [settings, sessions, currentId] = await Promise.all([
    getSettings(),
    prisma.session.findMany({ where: { userId: me.id, mfaPending: false }, orderBy: { lastSeenAt: 'desc' } }),
    getSessionId('admin'),
  ])
  return (
    <>
      <PageHeader eyebrow="Account" title="My security" description="Protect your administrator account. Admin sessions expire after 8 hours, or 60 minutes of inactivity." />
      {sp.welcome && <Alert tone="gain" className="mb-6" title="Super administrator created">Next, enable two-factor authentication below, then review platform settings.</Alert>}
      {sp.setup === 'required' && !me.totpEnabled && <Alert tone="warn" className="mb-6" title="Two-factor authentication required">The platform security policy requires 2FA for administrators. Set it up to continue.</Alert>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Two-factor authentication" />
          <div className="p-6"><MfaCard apiBase="/api/admin" enabled={me.totpEnabled} required={settings.security.requireAdminMfa} /></div>
        </Card>
        <Card>
          <CardHeader title="Role & permissions" action={<Badge tone="accent">{me.role.replace('_', ' ')}</Badge>} />
          <div className="flex flex-wrap gap-1.5 p-6">{effectivePermissions(me).map((p) => <Badge key={p}><span className="num">{p}</span></Badge>)}</div>
        </Card>
        <Card>
          <CardHeader title="Change password" />
          <div className="p-6"><ChangePasswordForm endpoint="/api/admin/password" /></div>
        </Card>
        <Card>
          <CardHeader title="Active admin sessions" />
          <div className="px-6 pb-6"><SessionsList endpoint="/api/admin/sessions" currentId={currentId} sessions={sessions.filter((s) => s.scope === 'admin').map((s) => ({ id: s.id, ip: s.ip, userAgent: s.userAgent, lastSeenAt: s.lastSeenAt.toISOString(), createdAt: s.createdAt.toISOString() }))} /></div>
        </Card>
      </div>
    </>
  )
}
