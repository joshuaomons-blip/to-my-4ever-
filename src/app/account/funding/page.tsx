import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { getSettings } from '@/server/settings'
import { getPaymentProvider } from '@/server/payments'
import { fundingAvailability, sweepDeposits } from '@/server/payments/service'
import { getPortfolio } from '@/server/services/portfolio'
import { Card, CardHeader, EmptyState, PageHeader, StatusBadge, Table, td, th } from '@/components/ui'
import { AutoRefresh, DepositForm } from '@/components/app/deposit-forms'
import { cn, dateTimeFmt, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Add funds' }

export default async function FundingPage() {
  const user = await requireCustomerPage()
  await sweepDeposits(user.id)
  const [settings, availability, portfolio, deposits, kyc] = await Promise.all([
    getSettings(),
    fundingAvailability(),
    getPortfolio(user.id),
    prisma.depositRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.kycSubmission.findUnique({ where: { userId: user.id }, select: { status: true } }),
  ])
  const provider = getPaymentProvider()
  const open = deposits.filter((d) => d.status === 'AWAITING_PAYMENT' || d.status === 'PROCESSING')
  const reason = !availability.available
    ? availability.message
    : settings.maintenance.enabled
      ? settings.maintenance.message
      : user.status !== 'ACTIVE'
        ? 'Your account is suspended. Contact support.'
        : !user.emailVerifiedAt
          ? 'Confirm your email address first. We sent you a link when you registered.'
          : availability.livemode && kyc?.status !== 'APPROVED'
            ? 'Identity verification must be approved before you can add real funds.'
            : undefined

  return (
    <>
      <AutoRefresh active={open.some((d) => d.status === 'PROCESSING')} everyMs={5000} />
      <PageHeader title="Add funds" description="Fund your account by bank transfer or card. Your balance updates only after the payment provider confirms the payment." />
      <div className="grid gap-6 lg:grid-cols-[440px_1fr]">
        <Card className="h-fit">
          <CardHeader title="New deposit" subtitle={provider.livemode ? 'Live payments' : 'Test mode: no real money is charged'} />
          <div className="p-5 sm:p-6">
            <DepositForm min={settings.trading.minDeposit} max={settings.trading.maxDeposit} disabledReason={reason} providerLabel={provider.livemode ? 'our payment provider' : 'the test payment provider'} />
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="grid sm:grid-cols-3">
            {[
              ['Cash available', usdFmt(portfolio.cash)],
              ['In progress', usdFmt(portfolio.pendingDeposits)],
              ['Deposited to date', usdFmt(portfolio.deposited)],
            ].map(([k, v], i) => (
              <div key={k} className={cn('p-5', i > 0 && 'border-t border-hairline sm:border-t-0 sm:border-l')}>
                <p className="eyebrow">{k}</p>
                <p className="num mt-1.5 text-[20px] font-semibold">{v}</p>
              </div>
            ))}
          </Card>

          <Card>
            <CardHeader title="How deposits work" />
            <ol className="space-y-3 p-5 text-[14px] leading-relaxed text-fg-2 sm:p-6">
              <li><span className="num mr-2 font-semibold text-fg">1</span>You choose an amount and method. We create a deposit with its own reference.</li>
              <li><span className="num mr-2 font-semibold text-fg">2</span>You pay on the provider’s secure page, or send a bank transfer quoting the reference.</li>
              <li><span className="num mr-2 font-semibold text-fg">3</span>The provider notifies us with a signed message. We check the signature, then confirm the payment directly with the provider.</li>
              <li><span className="num mr-2 font-semibold text-fg">4</span>Only then is the amount received added to your cash balance. Each payment can be credited once.</li>
            </ol>
            <p className="border-t border-hairline px-5 py-3 text-[13px] text-muted sm:px-6">We never accept screenshots, receipts or emailed confirmations as proof of payment.</p>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Deposit history" />
        {deposits.length === 0 ? (
          <EmptyState title="No deposits yet" description="Your deposits and their status will appear here." />
        ) : (
          <Table>
            <thead className="border-b border-hairline">
              <tr>
                <th className={th}>Reference</th>
                <th className={th}>Method</th>
                <th className={th}>Started</th>
                <th className={cn(th, 'text-right')}>Amount</th>
                <th className={cn(th, 'text-right')}>Received</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {deposits.map((d) => (
                <tr key={d.id} className="hover:bg-surface-2">
                  <td className={td}>
                    <Link href={`/account/funding/${d.id}`} className="font-mono text-[13px] text-fg hover:underline">{d.reference}</Link>
                    {d.isSeed && <span className="ml-2 rounded-sm bg-surface-3 px-1 text-[11px] text-muted">demo</span>}
                  </td>
                  <td className={cn(td, 'text-[13px] text-fg-2')}>{d.method === 'CARD' ? 'Card' : 'Bank transfer'}</td>
                  <td className={cn(td, 'text-[13px] text-muted')}>{dateTimeFmt(d.createdAt)}</td>
                  <td className={cn(td, 'num text-right')}>{usdFmt(Number(d.amount))}</td>
                  <td className={cn(td, 'num text-right', d.receivedAmount ? 'text-gain' : 'text-faint')}>{d.receivedAmount ? usdFmt(Number(d.receivedAmount)) : '—'}</td>
                  <td className={td}><StatusBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
