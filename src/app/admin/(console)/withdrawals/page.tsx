import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpFromLine, Flag } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireAdminPage } from '@/server/auth/session'
import { listTransactions } from '@/server/services/admin'
import { Card, CardHeader, EmptyState, PageHeader, Stat, StatusBadge, Table, td, th } from '@/components/ui'
import { ReviewButtons } from '@/components/admin/review'
import { cn, dateTimeFmt, relTime, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Withdrawals' }

export default async function WithdrawalsPage() {
  await requireAdminPage('withdrawals:review')
  const [pending, history, trail] = await Promise.all([
    prisma.transaction.findMany({
      where: { type: 'WITHDRAWAL', status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, flagged: true, account: { select: { cashBalance: true } }, kyc: { select: { status: true } } } } },
    }),
    listTransactions({ type: 'WITHDRAWAL' }, 15),
    prisma.auditLog.findMany({ where: { action: { startsWith: 'withdrawal.' } }, orderBy: { createdAt: 'desc' }, take: 25 }),
  ])
  const pendingTotal = pending.reduce((a, p) => a + Number(p.amount), 0)
  return (
    <>
      <PageHeader eyebrow="Operations" title="Withdrawal requests" description="Approve or reject simulated withdrawals. Every decision is recorded with the reviewer, note and timestamp." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Awaiting review" value={String(pending.length)} sub={usdFmt(pendingTotal)} />
        <Stat label="Oldest request" value={pending[0] ? relTime(pending[0].createdAt) : '—'} sub={pending[0]?.reference ?? 'Queue clear'} />
        <Stat label="All-time requests" value={String(history.total)} sub={`${usdFmt(history.sumAmount)} requested`} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Pending queue" subtitle="Oldest first" />
        {pending.length === 0 ? (
          <EmptyState icon={<ArrowUpFromLine className="size-5" />} title="No pending withdrawals" />
        ) : (
          <ul className="mt-3 divide-y divide-white/[0.05]">
            {pending.map((w) => (
              <li key={w.id} className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="num text-xl">{usdFmt(Number(w.amount))}</p>
                    <span className="num text-xs text-dim">{w.reference}</span>
                    {w.user.flagged && <span className="inline-flex items-center gap-1 text-[11px] text-warn"><Flag className="size-3" /> Customer flagged</span>}
                    {w.isSeed && <span className="rounded bg-white/[0.06] px-1.5 font-mono text-[9px] text-dim uppercase">demo</span>}
                  </div>
                  <p className="mt-1 text-sm text-mute">
                    <Link href={`/admin/customers/${w.user.id}`} className="text-silver hover:underline">{w.user.firstName} {w.user.lastName}</Link> · {w.user.email} · KYC {w.user.kyc?.status.toLowerCase()} · remaining cash {usdFmt(Number(w.user.account?.cashBalance ?? 0))}
                  </p>
                  <p className="mt-1 text-[11px] text-dim">Requested {dateTimeFmt(w.createdAt)} ({relTime(w.createdAt)}){w.customerNote ? ` · “${w.customerNote}”` : ''}</p>
                </div>
                <ReviewButtons kind="withdrawal" endpoint={`/api/admin/withdrawals/${w.id}`} subject={`${usdFmt(Number(w.amount))} for ${w.user.firstName} ${w.user.lastName} (${w.reference})`} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader title="Recent decisions" action={<Link href="/admin/transactions?type=WITHDRAWAL" className="text-xs text-mute hover:text-white">All withdrawals →</Link>} />
          <Table className="mt-3">
            <thead className="border-b border-white/[0.06]"><tr><th className={th}>Reference</th><th className={th}>Customer</th><th className={cn(th, 'text-right')}>Amount</th><th className={th}>Status</th><th className={th}>Reviewer</th><th className={th}>Note</th></tr></thead>
            <tbody className="divide-y divide-white/[0.04]">
              {history.rows.filter((r) => r.status !== 'PENDING').map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02]">
                  <td className={td}><Link href={`/admin/transactions/${r.id}`} className="num text-xs text-silver hover:underline">{r.reference}</Link></td>
                  <td className={cn(td, 'text-sm')}>{r.user.firstName} {r.user.lastName}</td>
                  <td className={cn(td, 'num text-right text-sm')}>{usdFmt(r.amount)}</td>
                  <td className={td}><StatusBadge status={r.status} /></td>
                  <td className={cn(td, 'text-xs text-mute')}>{r.reviewerEmail ?? (r.status === 'CANCELLED' ? 'Customer' : 'seed')}</td>
                  <td className={cn(td, 'max-w-48 truncate text-xs text-mute')}>{r.adminNote ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Audit trail" subtitle="Withdrawal events" />
          {trail.length === 0 ? <EmptyState title="No withdrawal events yet" /> : (
            <ol className="mt-4 space-y-3 px-6 pb-6">
              {trail.map((a) => {
                const meta = (a.metadata ?? {}) as { reference?: string; amount?: number; note?: string }
                return (
                  <li key={a.id} className="border-l-2 border-white/10 pl-3">
                    <p className={cn('num text-xs', a.action.endsWith('approved') ? 'text-gain' : a.action.endsWith('rejected') ? 'text-loss' : 'text-white')}>{a.action}</p>
                    <p className="text-[11px] text-mute">{meta.reference ?? a.targetId}{meta.amount ? ` · ${usdFmt(meta.amount)}` : ''}{meta.note ? ` · “${meta.note}”` : ''}</p>
                    <p className="text-[10px] text-dim">{a.actorEmail ?? 'system'} · {dateTimeFmt(a.createdAt)}</p>
                  </li>
                )
              })}
            </ol>
          )}
        </Card>
      </div>
    </>
  )
}
