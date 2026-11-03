import type { Metadata } from 'next'
import Link from 'next/link'
import type { TicketStatus } from '@prisma/client'
import { prisma } from '@/server/db'
import { requireAdminPage } from '@/server/auth/session'
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui'
import { cn, relTime } from '@/lib/format'

export const metadata: Metadata = { title: 'Support requests' }
const TABS: [TicketStatus | 'ALL', string][] = [['OPEN', 'Open'], ['ANSWERED', 'Answered'], ['CLOSED', 'Closed'], ['ALL', 'All']]

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage('support:manage')
  const sp = await searchParams
  const status = (TABS.find(([s]) => s === sp.status)?.[0] ?? 'OPEN') as TicketStatus | 'ALL'
  const [tickets, counts] = await Promise.all([
    prisma.supportTicket.findMany({
      where: status === 'ALL' ? {} : { status },
      orderBy: { updatedAt: status === 'OPEN' ? 'asc' : 'desc' },
      take: 100,
      include: { user: { select: { firstName: true, lastName: true, email: true } }, _count: { select: { messages: true } } },
    }),
    prisma.supportTicket.groupBy({ by: ['status'], _count: true }),
  ])
  const count = (s: string) => (s === 'ALL' ? counts.reduce((a, c) => a + c._count, 0) : (counts.find((c) => c.status === s)?._count ?? 0))
  return (
    <>
      <PageHeader title="Support requests" description="Requests sent by signed-in customers. Open requests are listed oldest first." />
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map(([s, label]) => (
          <Link key={s} href={`/admin/support?status=${s}`} className={cn('rounded-md border px-3.5 py-1.5 text-sm', status === s ? 'border-fg bg-fg text-white' : 'border-hairline bg-surface text-fg-2 hover:border-fg/30')}>
            {label} <span className="num ml-1 opacity-60">{count(s)}</span>
          </Link>
        ))}
      </div>
      <Card>
        {tickets.length === 0 ? (
          <EmptyState title={status === 'OPEN' ? 'No open requests' : 'Nothing here'} />
        ) : (
          <ul className="divide-y divide-hairline">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/support/${t.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.subject}</p>
                    <p className="text-[13px] text-muted">
                      {t.user.firstName} {t.user.lastName} ({t.user.email}) · {t.category} · {t._count.messages} message{t._count.messages === 1 ? '' : 's'} · updated {relTime(t.updatedAt)}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
