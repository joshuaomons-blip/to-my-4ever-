import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireAdminPage } from '@/server/auth/session'
import { Card, StatusBadge } from '@/components/ui'
import { TicketReply } from '@/components/app/support-forms'
import { SupportThread } from '@/components/support-thread'

export const metadata: Metadata = { title: 'Support request' }

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage('support:manage')
  const { id } = await params
  const t = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { firstName: true, lastName: true } } } },
    },
  })
  if (!t) notFound()
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/support" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> Support requests</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="display text-[26px] font-semibold">{t.subject}</h1>
          <p className="mt-1 text-[14px] text-muted">
            <Link href={`/admin/customers/${t.user.id}`} className="underline">{t.user.firstName} {t.user.lastName}</Link> ({t.user.email}) · {t.category} · <span className="font-mono">{t.reference}</span>
          </p>
        </div>
        <StatusBadge status={t.status} />
      </div>
      <SupportThread messages={t.messages} staffView />
      <Card className="mt-6 p-6">
        <TicketReply endpoint={`/api/admin/support/${t.id}/reply`} statusEndpoint={`/api/admin/support/${t.id}/status`} closed={t.status === 'CLOSED'} staff />
      </Card>
    </div>
  )
}
