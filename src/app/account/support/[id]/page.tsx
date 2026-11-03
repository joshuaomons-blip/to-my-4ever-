import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { Card, StatusBadge } from '@/components/ui'
import { TicketReply } from '@/components/app/support-forms'
import { SupportThread } from '@/components/support-thread'

export const metadata: Metadata = { title: 'Support request' }

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCustomerPage()
  const { id } = await params
  const t = await prisma.supportTicket.findFirst({
    where: { id, userId: user.id },
    include: { messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { firstName: true, lastName: true } } } } },
  })
  if (!t) notFound()
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/account/support" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Support
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="display text-[26px] font-semibold">{t.subject}</h1>
          <p className="mt-1 text-[14px] text-muted">
            {t.category} · <span className="font-mono">{t.reference}</span>
          </p>
        </div>
        <StatusBadge status={t.status} />
      </div>
      <SupportThread messages={t.messages} />
      <Card className="mt-6 p-5 sm:p-6">
        <TicketReply endpoint={`/api/support/tickets/${t.id}/reply`} statusEndpoint={`/api/support/tickets/${t.id}/status`} closed={t.status === 'CLOSED'} />
      </Card>
    </div>
  )
}
