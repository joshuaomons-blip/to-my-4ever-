import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Flag, Receipt, StickyNote } from 'lucide-react'
import { requireAdminPage } from '@/server/auth/session'
import { can } from '@/server/auth/permissions'
import { getCustomerDetail } from '@/server/services/admin'
import { getPortfolio } from '@/server/services/portfolio'
import { Alert, Badge, Card, CardHeader, EmptyState, SimBadge, Stat, StatusBadge } from '@/components/ui'
import { CustomerActions } from '@/components/admin/actions'
import { TxTable } from '@/components/app/tx-table'
import { cn, dateFmt, dateTimeFmt, pct, relTime, sharesFmt, signedUsd, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Customer profile' }

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage('customers:read')
  const { id } = await params
  const detail = await getCustomerDetail(id)
  if (!detail) notFound()
  const { user, transactions, activity } = detail
  const p = await getPortfolio(id)
  const kyc = user.kyc
  const buys = transactions.filter((t) => t.type === 'BUY' || t.type === 'SELL')

  return (
    <>
      <Link href="/admin/customers" className="mb-6 inline-flex items-center gap-1.5 text-sm text-mute hover:text-white"><ArrowLeft className="size-4" /> Customers</Link>
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-silver/25 to-white/5 font-display text-lg font-semibold">{user.firstName[0]}{user.lastName[0]}</span>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-semibold tracking-tight">
              {user.firstName} {user.lastName} <StatusBadge status={user.status} />
              {user.flagged && <Badge tone="warn"><Flag className="size-3" /> Flagged</Badge>}
              {user.isSeed && <Badge>Demo customer</Badge>}
            </h1>
            <p className="mt-1 text-sm text-mute">{user.email} · {user.account?.accountNumber} · joined {dateFmt(user.createdAt)}</p>
          </div>
        </div>
        {can(admin, 'customers:manage') && <CustomerActions id={user.id} status={user.status} flagged={user.flagged} />}
      </div>

      {user.status === 'SUSPENDED' && <Alert tone="loss" className="mb-4" title="Account suspended">{user.suspendedReason ?? 'No reason recorded.'}</Alert>}
      {user.flagged && <Alert tone="warn" className="mb-4" title="Flagged for suspicious activity">{user.flagReason}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Portfolio value" value={usdFmt(p.totalValue)} sub={<SimBadge>Simulated</SimBadge>} />
        <Stat label="Cash balance" value={usdFmt(p.cash)} sub={p.pendingWithdrawals ? `${usdFmt(p.pendingWithdrawals)} withdrawal pending` : 'Available'} />
        <Stat label="TSLA holdings" value={sharesFmt(p.shares, 4)} sub={`${usdFmt(p.marketValue)} · avg ${usdFmt(p.avgCost)}`} />
        <Stat label="Invested (cost basis)" value={usdFmt(p.invested)} sub={`Unrealized ${signedUsd(p.unrealizedPnl)}`} tone={p.unrealizedPnl >= 0 ? 'gain' : 'loss'} />
        <Stat label="Total P/L" value={signedUsd(p.totalPnl)} sub={`${pct(p.totalPnlPct)} · net deposits ${usdFmt(p.netContributions)}`} tone={p.totalPnl >= 0 ? 'gain' : 'loss'} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Profile" />
          <dl className="divide-y divide-white/[0.05] px-6 pt-3 pb-5 text-sm">
            {[
              ['Customer ID', user.id],
              ['Email verified', user.emailVerifiedAt ? dateTimeFmt(user.emailVerifiedAt) : 'No'],
              ['Phone', user.phone ?? '—'],
              ['Two-factor', user.totpEnabled ? 'Enabled' : 'Off'],
              ['Last login', user.lastLoginAt ? dateTimeFmt(user.lastLoginAt) : 'Never'],
              ['Active sessions', String(user.sessions.length)],
              ['Created', dateTimeFmt(user.createdAt)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5"><dt className="text-mute">{k}</dt><dd className="num truncate text-right text-xs">{v}</dd></div>
            ))}
          </dl>
        </Card>
        <Card>
          <CardHeader title="Verification (KYC)" action={<StatusBadge status={kyc?.status ?? 'NOT_STARTED'} />} />
          {kyc && kyc.status !== 'NOT_STARTED' ? (
            <dl className="divide-y divide-white/[0.05] px-6 pt-3 pb-5 text-sm">
              {[
                ['Legal name', kyc.legalName],
                ['Date of birth', kyc.dateOfBirth ? dateFmt(kyc.dateOfBirth) : '—'],
                ['Country', kyc.country],
                ['Address', [kyc.addressLine1, kyc.city, kyc.postalCode].filter(Boolean).join(', ')],
                ['Document type', kyc.documentType],
                ['Occupation', kyc.occupation],
                ['Submitted', kyc.submittedAt ? dateTimeFmt(kyc.submittedAt) : '—'],
                ['Reviewed', kyc.reviewedAt ? `${dateTimeFmt(kyc.reviewedAt)}${kyc.reviewer ? ` by ${kyc.reviewer.email}` : ''}` : '—'],
                ...(kyc.decisionReason ? [['Decision reason', kyc.decisionReason]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5"><dt className="shrink-0 text-mute">{k}</dt><dd className="text-right text-xs">{v ?? '—'}</dd></div>
              ))}
            </dl>
          ) : (
            <p className="px-6 py-8 text-sm text-mute">The customer has not submitted verification yet.</p>
          )}
          {kyc?.status === 'PENDING' && can(admin, 'kyc:review') && <div className="px-6 pb-6"><Link href="/admin/kyc" className="text-sm text-white underline">Review in KYC queue →</Link></div>}
        </Card>
        <Card>
          <CardHeader title="Internal notes" subtitle="Visible to administrators only" />
          {user.notesAbout.length === 0 ? (
            <EmptyState icon={<StickyNote className="size-5" />} title="No notes yet" />
          ) : (
            <ul className="max-h-96 space-y-3 overflow-y-auto px-6 pt-4 pb-6">
              {user.notesAbout.map((n) => (
                <li key={n.id} className="rounded-xl border border-white/[0.06] p-3">
                  <p className="text-sm leading-relaxed text-silver">{n.body}</p>
                  <p className="mt-1.5 text-[11px] text-dim">{n.author?.email ?? 'system'} · {n.context} · {relTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Transaction history" subtitle={`${transactions.length} transactions · ${buys.length} buy/sell orders`} />
        <div className="mt-4">
          {transactions.length === 0 ? <EmptyState icon={<Receipt className="size-5" />} title="No transactions" /> : <TxTable rows={transactions} hrefBase="/admin/transactions" />}
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Account activity" subtitle="Sign-ins, security changes and admin actions on this customer" />
        {activity.length === 0 ? (
          <EmptyState title="No recorded activity" />
        ) : (
          <ul className="mt-3 divide-y divide-white/[0.04] px-6 pb-4">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className={cn('num text-xs', a.action.includes('failed') ? 'text-loss' : 'text-white')}>{a.action}</span>
                <span className="text-[11px] text-dim">{a.actorEmail ?? 'system'} · {a.ip ?? '—'} · {dateTimeFmt(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
