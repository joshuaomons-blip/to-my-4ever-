import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { getSettings } from '@/server/settings'
import { Card, CardHeader, EmptyState, PageHeader, StatusBadge } from '@/components/ui'
import { NewTicketForm } from '@/components/app/support-forms'
import { relTime } from '@/lib/format'

export const metadata: Metadata = { title: 'Support' }

export default async function SupportPage() {
  const user = await requireCustomerPage()
  const [{ support }, tickets] = await Promise.all([
    getSettings(),
    prisma.supportTicket.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, include: { _count: { select: { messages: true } } } }),
  ])
  return (
    <>
      <PageHeader title="Support" description="Ask about your account, a payment or a withdrawal. Requests sent from here are tied to your verified account." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Your requests" />
          {tickets.length === 0 ? (
            <EmptyState title="No requests yet" description="Use the form to contact our team." />
          ) : (
            <ul className="divide-y divide-hairline">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link href={`/account/support/${t.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-surface-2 sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.subject}</p>
                      <p className="text-[13px] text-muted">
                        {t.category} · <span className="font-mono">{t.reference}</span> · {t._count.messages} message{t._count.messages === 1 ? '' : 's'} · updated {relTime(t.updatedAt)}
                      </p>
                    </div>
                    <StatusBadge status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="New request" />
            <div className="p-5 sm:p-6"><NewTicketForm /></div>
          </Card>
          <Card className="p-5 text-[14px] leading-relaxed text-fg-2 sm:p-6">
            <p className="font-semibold text-fg">Other ways to reach us</p>
            <p className="mt-2">
              <a className="underline" href={`mailto:${support.email}`}>{support.email}</a>
              <br />
              {support.phone}
              <br />
              {support.hours}
            </p>
            {support.note && <p className="mt-3 text-[13px] text-muted">{support.note}</p>}
          </Card>
        </div>
      </div>
    </>
  )
}
