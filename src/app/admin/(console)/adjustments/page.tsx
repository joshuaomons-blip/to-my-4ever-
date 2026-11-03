import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/server/db'
import { requireAdminPage } from '@/server/auth/session'
import { can } from '@/server/auth/permissions'
import { paymentsConfig } from '@/server/payments/config'
import { Card, CardHeader, EmptyState, PageHeader, StatusBadge, Table, td, th } from '@/components/ui'
import { AdjustmentDecision, AdjustmentForm } from '@/components/admin/money-tools'
import { cn, dateTimeFmt, signedUsd } from '@/lib/format'

export const metadata: Metadata = { title: 'Balance corrections' }

export default async function AdjustmentsPage() {
  const admin = await requireAdminPage('ledger:adjust')
  const live = paymentsConfig().livemode
  const rows = await prisma.ledgerAdjustment.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
      requestedBy: { select: { email: true } },
      approver: { select: { email: true } },
    },
  })
  const approver = can(admin, 'ledger:approve')
  return (
    <>
      <PageHeader
        title="Balance corrections"
        description={
          live
            ? 'Corrections to real-money records need a written reason, a supporting reference and approval from a second administrator. Balances are never edited directly; every correction is a ledger entry.'
            : 'Demo mode: manage simulated balances. Each correction needs a reason, is applied as a visible ledger entry and is recorded in the audit log.'
        }
      />
      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        <Card className="h-fit">
          <CardHeader title="New correction" />
          <div className="p-6"><AdjustmentForm live={live} /></div>
        </Card>
        <Card>
          <CardHeader title="History" subtitle={approver ? 'You can approve corrections requested by other administrators.' : 'Approval requires the ledger:approve permission.'} />
          {rows.length === 0 ? (
            <EmptyState title="No corrections yet" />
          ) : (
            <Table>
              <thead className="border-b border-hairline">
                <tr><th className={th}>Reference</th><th className={th}>Customer</th><th className={cn(th, 'text-right')}>Amount</th><th className={th}>Reason</th><th className={th}>Requested</th><th className={th}>Decision</th><th className={th}>Status</th></tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className={cn(td, 'font-mono text-[13px]')}>
                      {a.reference}
                      <p className="font-sans text-[12px] text-muted">{a.livemode ? 'Real money' : 'Demo'}</p>
                    </td>
                    <td className={td}>
                      <Link href={`/admin/customers/${a.user.id}`} className="text-sm hover:underline">{a.user.firstName} {a.user.lastName}</Link>
                      <p className="text-[12px] text-muted">{a.user.email}</p>
                    </td>
                    <td className={cn(td, 'num text-right', Number(a.amount) >= 0 ? 'text-gain' : 'text-loss')}>{signedUsd(Number(a.amount))}</td>
                    <td className={cn(td, 'max-w-64 text-[13px] whitespace-normal text-fg-2')}>
                      {a.reason}
                      {a.evidence && <p className="mt-0.5 text-[12px] text-muted">Ref: {a.evidence}</p>}
                    </td>
                    <td className={cn(td, 'text-[12px] text-muted')}>{a.requestedBy?.email ?? '—'}<br />{dateTimeFmt(a.createdAt)}</td>
                    <td className={cn(td, 'text-[12px] text-muted')}>
                      {a.status === 'PENDING_APPROVAL' && approver && a.requestedById !== admin.id ? (
                        <AdjustmentDecision id={a.id} reference={a.reference} />
                      ) : a.decidedAt ? (
                        <>
                          {a.approver?.email ?? '—'}
                          <br />
                          {dateTimeFmt(a.decidedAt)}
                          {a.decisionNote && <p className="mt-0.5 max-w-48 whitespace-normal">{a.decisionNote}</p>}
                        </>
                      ) : (
                        'Waiting for a second administrator'
                      )}
                    </td>
                    <td className={td}><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}
