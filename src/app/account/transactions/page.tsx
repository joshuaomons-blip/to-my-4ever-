import type { Metadata } from 'next'
import { Receipt } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { txWhere } from '@/server/services/admin'
import { sweepDeposits } from '@/server/payments/service'
import { toTxDTO } from '@/server/services/portfolio'
import { ButtonLink, Card, EmptyState, PageHeader, Pagination } from '@/components/ui'
import { FilterBar, TX_STATUS_FILTER, TX_TYPE_FILTER, qs } from '@/components/filter-bar'
import { TxTable } from '@/components/app/tx-table'

export const metadata: Metadata = { title: 'Transactions' }

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireCustomerPage()
  const sp = await searchParams
  await sweepDeposits(user.id)
  const page = Math.max(1, Number(sp.page) || 1)
  const where = { ...txWhere({ type: sp.type, status: sp.status, q: sp.q, from: sp.from, to: sp.to }), userId: user.id }
  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 20, take: 20 }),
  ])
  const pages = Math.max(1, Math.ceil(total / 20))
  return (
    <>
      <PageHeader title="Transactions" description="Every deposit, withdrawal, order and correction, with dates and references." actions={<ButtonLink href="/account/statements" variant="ghost">Download statement</ButtonLink>} />
      <Card>
        <FilterBar
          action="/account/transactions"
          q={sp.q}
          qPlaceholder="Search reference"
          filters={[TX_TYPE_FILTER, TX_STATUS_FILTER]}
          values={sp}
          extra={
            <>
              <input type="date" name="from" defaultValue={sp.from} aria-label="From date" className="h-10 rounded-md border border-fg/10 bg-canvas/70 px-3 text-sm text-fg-2" />
              <input type="date" name="to" defaultValue={sp.to} aria-label="To date" className="h-10 rounded-md border border-fg/10 bg-canvas/70 px-3 text-sm text-fg-2" />
            </>
          }
        />
        {rows.length === 0 ? (
          <EmptyState icon={<Receipt className="size-5" />} title={total === 0 && !sp.type && !sp.status && !sp.q ? 'No transactions yet' : 'No matching transactions'} description="Try adjusting your filters, or make your first sandbox deposit." action={<ButtonLink href="/account/funding" size="sm">Deposit funds</ButtonLink>} />
        ) : (
          <TxTable rows={rows.map(toTxDTO)} hrefBase="/account/transactions" />
        )}
        <Pagination page={page} pages={pages} hrefFor={(p) => `/account/transactions${qs(sp, { page: p })}`} />
      </Card>
      <p className="mt-3 text-xs text-faint">{total} transaction{total === 1 ? '' : 's'} · all simulated</p>
    </>
  )
}
