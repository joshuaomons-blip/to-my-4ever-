import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, ArrowUpFromLine, BadgeCheck, Flag, ShieldAlert, UserCheck, Users } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireAdminPage } from '@/server/auth/session'
import { can } from '@/server/auth/permissions'
import { getActivitySeries, getOverviewMetrics } from '@/server/services/admin'
import { Alert, Card, CardHeader, EmptyState, PageHeader, SimBadge, Stat } from '@/components/ui'
import { ActivityBars } from '@/components/charts'
import { TxTable } from '@/components/app/tx-table'
import { toTxDTO } from '@/server/services/portfolio'
import { numFmt, relTime, usdCompact, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Admin overview' }

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const admin = await requireAdminPage()
  const { denied } = await searchParams
  const [m, series, activity, recentTx] = await Promise.all([
    getOverviewMetrics(),
    getActivitySeries(30),
    can(admin, 'audit:read') ? prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 12 }) : Promise.resolve([]),
    can(admin, 'transactions:read')
      ? prisma.transaction.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } })
      : Promise.resolve([]),
  ])

  return (
    <>
      <PageHeader eyebrow="Overview" title={`Welcome, ${admin.firstName}`} description="Platform health at a glance. All monetary figures are simulated sandbox values." actions={<SimBadge>Sandbox totals</SimBadge>} />
      {denied && <Alert tone="loss" className="mb-6" title="Access denied">Your role does not include the “{denied}” permission. Ask a super administrator if you need it.</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Registered customers" value={numFmt(m.customers)} sub={`${m.recentLogins} active in last 30 days`} icon={<Users className="size-4" />} />
        <Stat label="Active customers" value={numFmt(m.active)} sub={`${m.suspended} suspended · ${m.flagged} flagged`} icon={<UserCheck className="size-4" />} />
        <Stat label="Pending KYC" value={numFmt(m.pendingKyc)} sub={m.pendingKyc ? 'Awaiting review' : 'Queue clear'} tone={m.pendingKyc ? 'neutral' : 'gain'} icon={<BadgeCheck className="size-4" />} />
        <Stat label="Pending withdrawals" value={numFmt(m.pendingWithdrawals)} sub={usdFmt(m.pendingWithdrawalAmount)} icon={<ArrowUpFromLine className="size-4" />} />
        <Stat label="Simulated deposits" value={usdCompact(m.totalDeposits)} sub="Completed, all time" />
        <Stat label="Simulated withdrawals" value={usdCompact(m.totalWithdrawals)} sub="Completed, all time" />
        <Stat label="Simulated investments" value={usdCompact(m.totalInvested)} sub={`${numFmt(m.sharesHeld, 2)} TSLA · worth ${usdCompact(m.holdingsValue)}`} />
        <Stat label="Trading volume" value={usdCompact(m.tradingVolume)} sub={`${m.tradeCount} orders · ${usdFmt(m.feesCollected)} sim. fees`} />
      </div>

      {(m.pendingKyc > 0 || m.pendingWithdrawals > 0 || m.flagged > 0) && (
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {[
            [m.pendingKyc, 'KYC submissions to review', '/admin/kyc', BadgeCheck],
            [m.pendingWithdrawals, 'Withdrawal requests to review', '/admin/withdrawals', ArrowUpFromLine],
            [m.flagged, 'Customers flagged for suspicious activity', '/admin/customers?flagged=1', Flag],
          ]
            .filter(([n]) => (n as number) > 0)
            .map(([n, label, href, Icon]) => {
              const I = Icon as typeof Flag
              return (
                <Link key={href as string} href={href as string} className="card group flex items-center gap-4 p-4 transition-colors hover:border-white/15">
                  <span className="grid size-10 place-items-center rounded-xl bg-warn/10 text-warn"><I className="size-[18px]" /></span>
                  <p className="flex-1 text-sm"><span className="num font-medium text-white">{n as number}</span> <span className="text-mute">{label as string}</span></p>
                  <ArrowRight className="size-4 text-dim group-hover:text-white" />
                </Link>
              )
            })}
        </div>
      )}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[1fr_400px]">
        <Card>
          <CardHeader title="Daily activity · last 30 days" subtitle="Completed simulated deposits, withdrawals and trading volume" />
          <div className="px-3 pt-4 pb-4">
            <ActivityBars data={series} />
            <div className="flex flex-wrap gap-4 px-3 pt-2 text-[11px] text-mute">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-accent" />Trading volume</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-silver" />Deposits</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-dim" />Withdrawals</span>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Recent activity" subtitle="From the audit log" action={can(admin, 'audit:read') && <Link href="/admin/audit" className="text-xs text-mute hover:text-white">View log →</Link>} />
          {activity.length === 0 ? (
            <EmptyState icon={<ShieldAlert className="size-5" />} title="No activity visible" description="Audit access is required to view activity." />
          ) : (
            <ul className="mt-3 divide-y divide-white/[0.04] px-5 pb-3">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="num truncate text-xs text-white">{a.action}</p>
                    <p className="truncate text-[11px] text-dim">{a.actorEmail ?? 'system'}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-dim">{relTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {recentTx.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Latest transactions" action={<Link href="/admin/transactions" className="text-xs text-mute hover:text-white">All transactions →</Link>} />
          <div className="mt-4"><TxTable rows={recentTx.map((t) => ({ ...toTxDTO(t), user: t.user }))} hrefBase="/admin/transactions" showCustomer customerHref="/admin/customers" /></div>
        </Card>
      )}
    </>
  )
}
