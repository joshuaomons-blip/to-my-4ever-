import type { Metadata } from 'next'
import Link from 'next/link'
import { FileClock } from 'lucide-react'
import { requireAdminPage } from '@/server/auth/session'
import { listAudit } from '@/server/services/admin'
import { Card, EmptyState, PageHeader, Pagination, Table, td, th } from '@/components/ui'
import { FilterBar, qs } from '@/components/filter-bar'
import { cn, dateTimeFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Audit log' }

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage('audit:read')
  const sp = await searchParams
  const data = await listAudit({ q: sp.q, action: sp.action, page: Number(sp.page) || 1 })
  return (
    <>
      <PageHeader title="Audit log" description="Immutable record of sign-ins, security changes, customer actions and administrative decisions." />
      <Card>
        <FilterBar
          action="/admin/audit"
          q={sp.q}
          qPlaceholder="Search actor email, action or target ID"
          values={sp}
          filters={[{ name: 'action', label: 'Category', options: [['admin.', 'Admin access'], ['customer.', 'Customer'], ['kyc.', 'KYC'], ['withdrawal.', 'Withdrawals'], ['deposit.', 'Deposits'], ['order.', 'Orders'], ['settings.', 'Settings'], ['mfa.', '2FA'], ['password.', 'Passwords']] }]}
        />
        {data.rows.length === 0 ? <EmptyState icon={<FileClock className="size-5" />} title="No matching events" /> : (
          <Table>
            <thead className="border-b border-fg/[0.06]"><tr><th className={th}>Time</th><th className={th}>Action</th><th className={th}>Actor</th><th className={th}>Target</th><th className={th}>IP</th><th className={th}>Details</th></tr></thead>
            <tbody className="divide-y divide-fg/[0.04]">
              {data.rows.map((a) => (
                <tr key={a.id} className="align-top hover:bg-fg/[0.02]">
                  <td className={cn(td, 'text-xs text-muted')}>{dateTimeFmt(a.createdAt)}</td>
                  <td className={cn(td, 'num text-xs', a.action.includes('failed') ? 'text-loss' : 'text-fg')}>{a.action}</td>
                  <td className={cn(td, 'text-xs text-fg-2')}>{a.actorEmail ?? 'system / anonymous'}</td>
                  <td className={cn(td, 'text-xs')}>
                    {a.targetType === 'user' && a.targetId ? <Link className="text-fg-2 hover:underline" href={`/admin/customers/${a.targetId}`}>user · {a.targetId.slice(0, 10)}…</Link>
                      : a.targetType === 'transaction' && a.targetId ? <Link className="text-fg-2 hover:underline" href={`/admin/transactions/${a.targetId}`}>transaction · {a.targetId.slice(0, 10)}…</Link>
                      : <span className="text-faint">{a.targetType ? `${a.targetType} · ${a.targetId ?? ''}` : '—'}</span>}
                  </td>
                  <td className={cn(td, 'num text-xs text-faint')}>{a.ip ?? '—'}</td>
                  <td className={cn(td, 'max-w-80 truncate font-mono text-[10.5px] text-faint')} title={a.metadata ? JSON.stringify(a.metadata) : ''}>{a.metadata ? JSON.stringify(a.metadata) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={data.page} pages={data.pages} hrefFor={(p) => `/admin/audit${qs(sp, { page: p })}`} />
      </Card>
      <p className="mt-3 text-xs text-faint">{data.total} events</p>
    </>
  )
}
