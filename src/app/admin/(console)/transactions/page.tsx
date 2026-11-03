import type { Metadata } from 'next'
import { Download, Receipt } from 'lucide-react'
import { requireAdminPage } from '@/server/auth/session'
import { can } from '@/server/auth/permissions'
import { listTransactions } from '@/server/services/admin'
import { buttonClass, Card, EmptyState, PageHeader, Pagination, SimBadge } from '@/components/ui'
import { FilterBar, TX_STATUS_FILTER, TX_TYPE_FILTER, qs } from '@/components/filter-bar'
import { TxTable } from '@/components/app/tx-table'
import { usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Transactions' }

export default async function AdminTransactions({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requireAdminPage('transactions:read')
  const sp = await searchParams
  const filters = { q: sp.q, type: sp.type, status: sp.status, from: sp.from, to: sp.to }
  const data = await listTransactions({ ...filters, page: Number(sp.page) || 1 })
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="All transactions"
        description="Deposits, withdrawals, buy and sell orders across every customer."
        actions={
          <>
            <SimBadge>Simulated ledger</SimBadge>
            {can(admin, 'transactions:export') && (
              <a href={`/api/admin/transactions/export${qs(filters, {})}`} className={buttonClass('light', 'md')}><Download className="size-4" /> Export CSV</a>
            )}
          </>
        }
      />
      <Card>
        <FilterBar
          action="/admin/transactions"
          q={sp.q}
          qPlaceholder="Search reference, email or surname"
          filters={[TX_TYPE_FILTER, TX_STATUS_FILTER]}
          values={sp}
          extra={
            <>
              <input type="date" name="from" defaultValue={sp.from} aria-label="From date" className="h-10 rounded-xl border border-white/10 bg-ink/70 px-3 text-sm text-silver" />
              <input type="date" name="to" defaultValue={sp.to} aria-label="To date" className="h-10 rounded-xl border border-white/10 bg-ink/70 px-3 text-sm text-silver" />
            </>
          }
        />
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-white/[0.06] px-5 py-3 text-xs text-mute">
          <span><span className="num text-white">{data.total}</span> transactions</span>
          <span>Gross amount <span className="num text-white">{usdFmt(data.sumAmount)}</span></span>
          <span>Simulated fees <span className="num text-white">{usdFmt(data.sumFees)}</span></span>
        </div>
        {data.rows.length === 0 ? <EmptyState icon={<Receipt className="size-5" />} title="No transactions match" /> : <TxTable rows={data.rows} hrefBase="/admin/transactions" showCustomer customerHref="/admin/customers" />}
        <Pagination page={data.page} pages={data.pages} hrefFor={(p) => `/admin/transactions${qs(sp, { page: p })}`} />
      </Card>
    </>
  )
}
