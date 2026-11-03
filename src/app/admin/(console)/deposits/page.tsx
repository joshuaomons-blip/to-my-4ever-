import type { Metadata } from 'next'
import Link from 'next/link'
import type { DepositStatus, Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { requireAdminPage } from '@/server/auth/session'
import { sweepDeposits } from '@/server/payments/service'
import { Card, EmptyState, PageHeader, Pagination, StatusBadge, Table, td, th } from '@/components/ui'
import { FilterBar, qs } from '@/components/filter-bar'
import { cn, dateTimeFmt, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Deposits' }
const STATUSES: DepositStatus[] = ['AWAITING_PAYMENT', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED']

export default async function DepositsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage('payments:review')
  await sweepDeposits()
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const where: Prisma.DepositRequestWhereInput = {}
  if (sp.status && STATUSES.includes(sp.status as DepositStatus)) where.status = sp.status as DepositStatus
  if (sp.method === 'CARD' || sp.method === 'BANK_TRANSFER') where.method = sp.method
  if (sp.q) where.OR = [{ reference: { contains: sp.q.trim(), mode: 'insensitive' } }, { user: { email: { contains: sp.q.trim(), mode: 'insensitive' } } }]
  const [total, rows, sums] = await Promise.all([
    prisma.depositRequest.count({ where }),
    prisma.depositRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 20, take: 20, include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } }),
    prisma.depositRequest.groupBy({ by: ['status'], _sum: { amount: true, receivedAmount: true }, _count: true }),
  ])
  const sum = (s: DepositStatus) => sums.find((x) => x.status === s)
  return (
    <>
      <PageHeader title="Deposits" description="Every deposit request and its status at the payment provider. Deposits are credited automatically, only after the provider confirms payment. There is no manual “mark as paid”." />
      <Card className="mb-6 grid grid-cols-2 lg:grid-cols-4">
        {[
          ['Awaiting payment', sum('AWAITING_PAYMENT')?._count ?? 0, usdFmt(Number(sum('AWAITING_PAYMENT')?._sum.amount ?? 0))],
          ['Processing', sum('PROCESSING')?._count ?? 0, usdFmt(Number(sum('PROCESSING')?._sum.amount ?? 0))],
          ['Received', sum('SUCCEEDED')?._count ?? 0, usdFmt(Number(sum('SUCCEEDED')?._sum.receivedAmount ?? 0))],
          ['Failed or expired', (sum('FAILED')?._count ?? 0) + (sum('EXPIRED')?._count ?? 0), `${sum('CANCELLED')?._count ?? 0} cancelled`],
        ].map(([k, n, v], i) => (
          <div key={k as string} className={cn('p-5', i > 0 && 'border-l border-hairline', i === 2 && 'max-lg:border-l-0 max-lg:border-t', i === 3 && 'max-lg:border-t')}>
            <p className="eyebrow">{k}</p>
            <p className="num mt-1.5 text-[22px] font-semibold">{n}</p>
            <p className="num text-[13px] text-muted">{v}</p>
          </div>
        ))}
      </Card>
      <Card>
        <FilterBar
          action="/admin/deposits"
          q={sp.q}
          qPlaceholder="Search reference or customer email"
          values={sp}
          filters={[
            { name: 'status', label: 'Status', options: STATUSES.map((s) => [s, s.replace('_', ' ').toLowerCase()]) as [string, string][] },
            { name: 'method', label: 'Method', options: [['BANK_TRANSFER', 'Bank transfer'], ['CARD', 'Card']] },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState title="No deposits match" />
        ) : (
          <Table>
            <thead className="border-b border-hairline">
              <tr>
                <th className={th}>Reference</th>
                <th className={th}>Customer</th>
                <th className={th}>Method</th>
                <th className={th}>Provider</th>
                <th className={cn(th, 'text-right')}>Requested</th>
                <th className={cn(th, 'text-right')}>Received</th>
                <th className={th}>Status</th>
                <th className={th}>Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-surface-2">
                  <td className={td}>
                    <Link href={`/admin/deposits/${d.id}`} className="font-mono text-[13px] hover:underline">{d.reference}</Link>
                    {d.isSeed && <span className="ml-2 rounded-sm bg-surface-3 px-1 text-[11px] text-muted">demo</span>}
                  </td>
                  <td className={td}>
                    <Link href={`/admin/customers/${d.user.id}`} className="text-sm hover:underline">{d.user.firstName} {d.user.lastName}</Link>
                    <p className="text-[12px] text-muted">{d.user.email}</p>
                  </td>
                  <td className={cn(td, 'text-[13px]')}>{d.method === 'CARD' ? 'Card' : 'Bank transfer'}</td>
                  <td className={cn(td, 'text-[13px] text-muted')}>{d.provider}{d.livemode ? ' (live)' : ' (test)'}</td>
                  <td className={cn(td, 'num text-right')}>{usdFmt(Number(d.amount))}</td>
                  <td className={cn(td, 'num text-right', d.receivedAmount ? 'text-gain' : 'text-faint')}>{d.receivedAmount ? usdFmt(Number(d.receivedAmount)) : '—'}</td>
                  <td className={td}><StatusBadge status={d.status} /></td>
                  <td className={cn(td, 'text-[13px] text-muted')}>{dateTimeFmt(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page} pages={Math.max(1, Math.ceil(total / 20))} hrefFor={(p) => `/admin/deposits${qs(sp, { page: p })}`} />
      </Card>
    </>
  )
}
