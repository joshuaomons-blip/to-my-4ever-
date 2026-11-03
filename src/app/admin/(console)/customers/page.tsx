import type { Metadata } from 'next'
import Link from 'next/link'
import { Flag, Users } from 'lucide-react'
import { requireAdminPage } from '@/server/auth/session'
import { listCustomers } from '@/server/services/admin'
import { Card, EmptyState, PageHeader, Pagination, StatusBadge, Table, td, th } from '@/components/ui'
import { FilterBar, qs } from '@/components/filter-bar'
import { cn, dateFmt, relTime, sharesFmt, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Customers' }

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage('customers:read')
  const sp = await searchParams
  const data = await listCustomers({ q: sp.q, status: sp.status, kyc: sp.kyc, flagged: sp.flagged, page: Number(sp.page) || 1 })
  return (
    <>
      <PageHeader title="Customers" description={`${data.total} customer${data.total === 1 ? '' : 's'} match the current filters.`} />
      <Card>
        <FilterBar
          action="/admin/customers"
          q={sp.q}
          qPlaceholder="Search name, email or account number"
          values={sp}
          filters={[
            { name: 'status', label: 'Status', options: [['ACTIVE', 'Active'], ['SUSPENDED', 'Suspended']] },
            { name: 'kyc', label: 'KYC', options: [['NOT_STARTED', 'Not started'], ['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']] },
            { name: 'flagged', label: 'Flag', options: [['1', 'Flagged only']] },
          ]}
        />
        {data.rows.length === 0 ? (
          <EmptyState icon={<Users className="size-5" />} title="No customers found" description="Try a different search or clear the filters." />
        ) : (
          <Table>
            <thead className="border-b border-fg/[0.06]">
              <tr>
                <th className={th}>Customer</th><th className={th}>Account</th><th className={th}>Status</th><th className={th}>KYC</th>
                <th className={cn(th, 'text-right')}>Cash</th><th className={cn(th, 'text-right')}>TSLA</th><th className={cn(th, 'text-right')}>Portfolio</th>
                <th className={th}>Joined</th><th className={th}>Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fg/[0.04]">
              {data.rows.map((c) => (
                <tr key={c.id} className="group hover:bg-fg/[0.02]">
                  <td className={td}>
                    <Link href={`/admin/customers/${c.id}`} className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fg/[0.06] text-[11px] font-semibold">{c.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
                      <span>
                        <span className="flex items-center gap-1.5 text-sm font-medium group-hover:underline">{c.name}{c.flagged && <Flag className="size-3.5 text-warn" aria-label="Flagged" />}{c.isSeed && <span className="rounded bg-fg/[0.06] px-1 font-mono text-[9px] text-faint uppercase">demo</span>}</span>
                        <span className="block text-[11px] text-faint">{c.email}{!c.emailVerified && ' · unverified'}</span>
                      </span>
                    </Link>
                  </td>
                  <td className={cn(td, 'num text-xs text-fg-2')}>{c.accountNumber}</td>
                  <td className={td}><StatusBadge status={c.status} /></td>
                  <td className={td}><StatusBadge status={c.kyc} /></td>
                  <td className={cn(td, 'num text-right text-sm')}>{usdFmt(c.cash)}</td>
                  <td className={cn(td, 'num text-right text-sm')}>{sharesFmt(c.shares, 4)}</td>
                  <td className={cn(td, 'num text-right text-sm text-fg')}>{usdFmt(c.totalValue)}</td>
                  <td className={cn(td, 'text-xs text-muted')}>{dateFmt(c.createdAt)}</td>
                  <td className={cn(td, 'text-xs text-muted')}>{c.lastLoginAt ? relTime(c.lastLoginAt) : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={data.page} pages={data.pages} hrefFor={(p) => `/admin/customers${qs(sp, { page: p })}`} />
      </Card>
    </>
  )
}
