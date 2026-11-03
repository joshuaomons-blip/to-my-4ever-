import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireAdminPage } from '@/server/auth/session'
import { can } from '@/server/auth/permissions'
import { toTxDTO } from '@/server/services/portfolio'
import { Card, CardHeader, EmptyState, SimBadge, StatusBadge } from '@/components/ui'
import { TX_LABEL, TxIcon, signedAmount } from '@/components/app/tx-table'
import { ReviewButtons } from '@/components/admin/review'
import { dateTimeFmt, sharesFmt, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Transaction detail' }

export default async function AdminTxDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage('transactions:read')
  const { id } = await params
  const row = await prisma.transaction.findUnique({ where: { id }, include: { user: { select: { id: true, email: true, firstName: true, lastName: true } }, reviewer: { select: { email: true } } } })
  if (!row) notFound()
  const t = toTxDTO(row)
  const trail = await prisma.auditLog.findMany({ where: { targetType: 'transaction', targetId: id }, orderBy: { createdAt: 'asc' } })
  const amt = signedAmount(t)
  const lines: [string, string][] = [
    ['Reference', t.reference],
    ['Internal ID', t.id],
    ['Customer', `${row.user.firstName} ${row.user.lastName} (${row.user.email})`],
    ['Type', TX_LABEL[t.type]],
    ['Created', dateTimeFmt(t.createdAt)],
    ['Completed', t.completedAt ? dateTimeFmt(t.completedAt) : '—'],
    ...(t.shares != null ? ([['Shares', sharesFmt(t.shares)], ['Price', usdFmt(t.price)]] as [string, string][]) : []),
    ['Gross amount', usdFmt(t.amount)],
    ['Fee', usdFmt(t.fee)],
    ['Customer cash impact', `${amt >= 0 ? '+' : '−'}${usdFmt(Math.abs(amt))}`],
    ['Method', t.method ?? '—'],
    ['Broker mode / ref', `${row.brokerMode} · ${t.brokerRef ?? '—'}`],
    ['Reviewer', row.reviewer?.email ?? '—'],
    ['Customer note', t.customerNote ?? '—'],
    ['Admin note', t.adminNote ?? '—'],
    ['Demo seed data', t.isSeed ? 'Yes' : 'No'],
  ]
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/transactions" className="mb-6 inline-flex items-center gap-1.5 text-sm text-mute hover:text-white"><ArrowLeft className="size-4" /> Transactions</Link>
      <Card>
        <div className="flex flex-wrap items-center gap-4 border-b border-white/[0.06] p-6">
          <TxIcon type={t.type} />
          <div className="flex-1">
            <p className="font-display text-lg">{TX_LABEL[t.type]} · <span className="num">{usdFmt(t.amount)}</span></p>
            <p className="num text-xs text-dim">{t.reference}</p>
          </div>
          <StatusBadge status={t.status} />
          <SimBadge>Simulated</SimBadge>
        </div>
        {t.type === 'WITHDRAWAL' && t.status === 'PENDING' && can(admin, 'withdrawals:review') && (
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-warn/[0.04] px-6 py-4">
            <p className="text-sm text-warn">This withdrawal is awaiting review.</p>
            <ReviewButtons kind="withdrawal" endpoint={`/api/admin/withdrawals/${t.id}`} subject={`${usdFmt(t.amount)} · ${t.reference}`} />
          </div>
        )}
        <dl className="divide-y divide-white/[0.05] px-6">
          {lines.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-6 py-3 text-sm"><dt className="shrink-0 text-mute">{k}</dt><dd className="num text-right text-xs break-all">{k === 'Customer' ? <Link href={`/admin/customers/${row.user.id}`} className="hover:underline">{v}</Link> : v}</dd></div>
          ))}
        </dl>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Audit trail" />
        {trail.length === 0 ? <EmptyState title="No audit events for this transaction" description="Seeded demo transactions are created without audit events." /> : (
          <ol className="mt-4 space-y-3 px-6 pb-6">
            {trail.map((a) => (
              <li key={a.id} className="border-l-2 border-white/10 pl-3">
                <p className="num text-xs text-white">{a.action}</p>
                <p className="text-[11px] text-dim">{a.actorEmail ?? 'system'} · {a.ip ?? '—'} · {dateTimeFmt(a.createdAt)}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  )
}
