import type { Metadata } from 'next'
import Link from 'next/link'
import { History } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { getSettings } from '@/server/settings'
import { getPortfolio } from '@/server/services/portfolio'
import { Card, CardHeader, EmptyState, PageHeader, SimBadge, Stat, StatusBadge, Table, td, th } from '@/components/ui'
import { CancelWithdrawalButton, WithdrawForm } from '@/components/app/funding-forms'
import { cn, dateTimeFmt, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Withdraw' }

export default async function WithdrawPage() {
  const user = await requireCustomerPage()
  const [portfolio, settings, kyc] = await Promise.all([getPortfolio(user.id), getSettings(), prisma.kycSubmission.findUnique({ where: { userId: user.id }, select: { status: true } })])
  const rows = await prisma.transaction.findMany({ where: { userId: user.id, type: 'WITHDRAWAL' }, orderBy: { createdAt: 'desc' }, take: 50 })
  const reason = settings.maintenance.enabled
    ? settings.maintenance.message
    : !user.emailVerifiedAt
      ? 'Verify your email address first.'
      : kyc?.status !== 'APPROVED'
        ? 'Identity verification must be approved before you can request withdrawals.'
        : portfolio.cash < settings.trading.minWithdrawal
          ? `You need at least ${usdFmt(settings.trading.minWithdrawal)} in available cash. Sell shares or deposit funds first.`
          : undefined
  return (
    <>
      <PageHeader eyebrow="Funding" title="Withdraw funds" description="Request a simulated withdrawal of available cash. Requests are reviewed by an administrator." />
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="h-fit p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-[15px] font-medium">New withdrawal</h2>
            <SimBadge>Sandbox only</SimBadge>
          </div>
          <WithdrawForm cash={portfolio.cash} min={settings.trading.minWithdrawal} disabledReason={reason} />
          {kyc?.status !== 'APPROVED' && <Link href="/app/kyc" className="mt-4 block text-center text-sm text-white underline">Go to verification</Link>}
        </Card>
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Available to withdraw" value={usdFmt(portfolio.cash)} />
            <Stat label="Pending review" value={usdFmt(portfolio.pendingWithdrawals)} />
            <Stat label="Total withdrawn" value={usdFmt(portfolio.withdrawn - portfolio.pendingWithdrawals)} />
          </div>
          <Card>
            <CardHeader title="Withdrawal history" subtitle="Pending, approved and rejected requests" />
            <div className="mt-4">
              {rows.length === 0 ? (
                <EmptyState icon={<History className="size-5" />} title="No withdrawals yet" />
              ) : (
                <Table>
                  <thead className="border-b border-white/[0.06]"><tr><th className={th}>Reference</th><th className={th}>Requested</th><th className={cn(th, 'text-right')}>Amount</th><th className={th}>Status</th><th className={th}>Reviewer note</th><th className={th} /></tr></thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-white/[0.02]">
                        <td className={td}><Link href={`/app/transactions/${r.id}`} className="num text-xs text-silver hover:text-white hover:underline">{r.reference}</Link></td>
                        <td className={cn(td, 'text-xs text-mute')}>{dateTimeFmt(r.createdAt)}</td>
                        <td className={cn(td, 'num text-right')}>{usdFmt(Number(r.amount))}</td>
                        <td className={td}><StatusBadge status={r.status} /></td>
                        <td className={cn(td, 'max-w-56 truncate text-xs text-mute')}>{r.adminNote ?? '—'}</td>
                        <td className={cn(td, 'text-right')}>{r.status === 'PENDING' && <CancelWithdrawalButton id={r.id} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
