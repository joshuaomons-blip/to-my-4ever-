import type { Metadata } from 'next'
import { History } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { getSettings } from '@/server/settings'
import { getPortfolio, toTxDTO } from '@/server/services/portfolio'
import { Card, CardHeader, EmptyState, PageHeader, SimBadge, Stat } from '@/components/ui'
import { AutoRefresh, DepositForm } from '@/components/app/funding-forms'
import { TxTable } from '@/components/app/tx-table'
import { usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Deposit funds' }

export default async function FundingPage() {
  const user = await requireCustomerPage()
  const [portfolio, settings] = await Promise.all([getPortfolio(user.id), getSettings()])
  const deposits = await prisma.transaction.findMany({ where: { userId: user.id, type: 'DEPOSIT' }, orderBy: { createdAt: 'desc' }, take: 50 })
  const pending = deposits.filter((d) => d.status === 'PENDING')
  const reason = settings.maintenance.enabled ? settings.maintenance.message : user.status !== 'ACTIVE' ? 'Your account is suspended.' : !user.emailVerifiedAt ? 'Verify your email address to unlock sandbox funding. Check the sandbox mailbox for your link.' : undefined
  return (
    <>
      <AutoRefresh active={pending.length > 0} />
      <PageHeader eyebrow="Funding" title="Deposit virtual funds" description="Add simulated money to your sandbox account. No real payment is taken and no payment details are stored." />
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="h-fit p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-[15px] font-medium">New deposit</h2>
            <SimBadge>Virtual money</SimBadge>
          </div>
          <DepositForm min={settings.trading.minDeposit} max={settings.trading.maxDeposit} settlementSeconds={settings.trading.depositSettlementSeconds} disabledReason={reason} />
        </Card>
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Available cash" value={usdFmt(portfolio.cash)} />
            <Stat label="Settling" value={usdFmt(portfolio.pendingDeposits)} sub={pending.length ? `${pending.length} pending` : 'None pending'} tone={pending.length ? 'neutral' : undefined} />
            <Stat label="Total deposited" value={usdFmt(portfolio.deposited)} />
          </div>
          <Card>
            <CardHeader title="Payment history" subtitle={pending.length ? 'Pending deposits update automatically' : 'All sandbox deposits'} />
            <div className="mt-4">
              {deposits.length === 0 ? <EmptyState icon={<History className="size-5" />} title="No deposits yet" description="Your sandbox deposits will appear here." /> : <TxTable rows={deposits.map(toTxDTO)} hrefBase="/app/transactions" />}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
