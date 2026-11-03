import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { requireAdminPage } from '@/server/auth/session'
import { PERMISSIONS, ROLE_DEFAULTS } from '@/server/auth/permissions'
import { Card, PageHeader } from '@/components/ui'
import { AdminsManager } from '@/components/admin/admins-manager'

export const metadata: Metadata = { title: 'Administrators' }

export default async function AdminsPage() {
  const me = await requireAdminPage('admins:manage')
  const admins = await prisma.user.findMany({ where: { role: { in: ['SUPPORT', 'ADMIN', 'SUPER_ADMIN'] } }, orderBy: { createdAt: 'asc' } })
  return (
    <>
      <PageHeader eyebrow="Access control" title="Administrators" description="Create administrator accounts and assign role-based permissions. Only super administrators can manage administrators." />
      <Card>
        <AdminsManager
          selfId={me.id}
          perms={PERMISSIONS}
          roleDefaults={ROLE_DEFAULTS}
          rows={admins.map((a) => ({ id: a.id, email: a.email, firstName: a.firstName, lastName: a.lastName, role: a.role, status: a.status, permissions: a.permissions, totpEnabled: a.totpEnabled, lastLoginAt: a.lastLoginAt?.toISOString() ?? null }))}
        />
      </Card>
    </>
  )
}
