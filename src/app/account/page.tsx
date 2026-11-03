import type { Metadata } from 'next'
import Link from 'next/link'
import { CircleCheck, CircleDashed, Clock, Receipt } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { getPortfolio, toTxDTO } from '@/server/services/portfolio'
import { ButtonLink, Card, CardHeader, EmptyState, SimBadge, StatusBadge } from '@/components/ui'
import { PriceChartCard } from '@/components/charts'
import { LiveQuote } from '@/components/live-quote'
import { TxTable } from '@/components/app/tx-table'
import { AnnouncementBar } from '@/components/site/announcements'
import { cn, dateTimeFmt, pct, sharesFmt, signedUsd, usdFmt } from '@/lib/format'
import { mailboxEnabled } from '@/server/mailer'

export const metadata: Metadata = { title: 'Account overview' }

function greeting() {
  const h = new Date().getUTCHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default async function Overview() {
  const user = await requireCustomerPage()
  const portfolio = await getPortfolio(user.id)
  const [recent, kyc, announcements, openDeposits] = await Promise.all([
    prisma.transaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 6 }),
    prisma.kycSubmission.findUnique({ where: { userId: user.id }, select: { status: true } }),
    prisma.announcement.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' }, take: 2 }),
    prisma.depositRequest.findMany({ where: { userId: user.id, status: { in: ['AWAITING_PAYMENT', 'PROCESSING'] } }, orderBy: { createdAt: 'desc' }, take: 3 }),
  ])
  const steps = [
    { done: !!user.emailVerifiedAt, label: 'Confirm your email', href: mailboxEnabled() ? '/dev/mailbox' : '/account/profile' },
    { done: kyc?.status === 'APPROVED', pending: kyc?.status === 'PENDING', label: 'Verify your identity', href: '/account/kyc' },
    { done: portfolio.deposited > 0, pending: openDeposits.length > 0, label: 'Add funds', href: '/account/funding' },
    { done: portfolio.tradeCount > 0, label: 'Place your first TSLA order', href: '/account/trade' },
  ]
  const onboarding = steps.some((s) => !s.done)
  const q = portfolio.quote
  const figures = [
    { label: 'Total value', value: usdFmt(portfolio.totalValue), sub: `${signedUsd(portfolio.dayChange)} today`, tone: portfolio.dayChange >= 0 ? 'text-gain' : 'text-loss' },
    { label: 'Cash available', value: usdFmt(portfolio.cash), sub: portfolio.pendingDeposits > 0 ? `${usdFmt(portfolio.pendingDeposits)} on its way` : 'Ready to invest or withdraw', tone: 'text-muted' },
    { label: 'Invested in TSLA', value: usdFmt(portfolio.invested), sub: `${sharesFmt(portfolio.shares, 4)} shares, simulated`, tone: 'text-muted' },
    { label: 'Total return', value: signedUsd(portfolio.totalPnl), sub: `${pct(portfolio.totalPnlPct)} on net deposits`, tone: portfolio.totalPnl >= 0 ? 'text-gain' : 'text-loss' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="num text-[13px] text-muted">Account {portfolio.accountNumber}</p>
          <h1 className="display mt-1 text-[30px] font-semibold">{greeting()}, {user.firstName}</h1>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/account/funding" variant="ghost">Add funds</ButtonLink>
          <ButtonLink href="/account/trade">Trade TSLA</ButtonLink>
        </div>
      </div>

      {announcements.length > 0 && <AnnouncementBar items={announcements} />}

      {onboarding && (
        <Card>
          <CardHeader title="Finish setting up your account" subtitle={`${steps.filter((s) => s.done).length} of ${steps.length} steps complete`} />
          <ol className="grid divide-y divide-hairline sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {steps.map((s, i) => (
              <li key={s.label}>
                <Link href={s.href} className="flex h-full items-center gap-3 px-5 py-4 text-[14px] hover:bg-surface-2">
                  {s.done ? <CircleCheck className="size-5 shrink-0 text-gain" /> : s.pending ? <Clock className="size-5 shrink-0 text-warn" /> : <CircleDashed className="size-5 shrink-0 text-faint" />}
                  <span className={cn(s.done ? 'text-muted' : 'font-medium text-fg')}>
                    <span className="num mr-1 text-faint">{i + 1}.</span> {s.label}
                  </span>
                  {s.pending && !s.done && <span className="ml-auto text-[12px] text-warn">In progress</span>}
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card className="grid grid-cols-2 lg:grid-cols-4">
        {figures.map((f, i) => (
          <div key={f.label} className={cn('p-5 sm:p-6', i % 2 === 1 && 'border-l border-hairline', i >= 2 && 'border-t border-hairline lg:border-t-0', i === 2 && 'lg:border-l')}>
            <p className="eyebrow">{f.label}</p>
            <p className="num mt-2 text-[22px] font-semibold sm:text-[26px]">{f.value}</p>
            <p className={cn('num mt-1 text-[13px]', f.tone)}>{f.sub}</p>
          </div>
        ))}
      </Card>

      {openDeposits.length > 0 && (
        <Card>
          <CardHeader title="Deposits in progress" subtitle="Your balance updates as soon as the payment provider confirms each payment." />
          <ul className="divide-y divide-hairline">
            {openDeposits.map((d) => (
              <li key={d.id}>
                <Link href={`/account/funding/${d.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3.5 text-sm hover:bg-surface-2 sm:px-6">
                  <span className="num font-semibold">{usdFmt(Number(d.amount))}</span>
                  <span className="font-mono text-[13px] text-fg-2">{d.reference}</span>
                  <span className="text-muted">{d.method === 'CARD' ? 'Card payment' : 'Bank transfer'}, started {dateTimeFmt(d.createdAt)}</span>
                  <span className="ml-auto"><StatusBadge status={d.status} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <PriceChartCard
            kind="portfolio"
            defaultRange="3M"
            height={300}
            title={<h2 className="text-[15px] font-semibold">Portfolio value</h2>}
            emptyHint={
              <span>
                Your portfolio value appears here after your first deposit.
                <br />
                <Link href="/account/funding" className="text-fg underline">Add funds</Link>
              </span>
            }
          />
        </Card>
        <Card className="flex flex-col">
          <div className="border-b border-hairline p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold">TSLA</p>
              <SimBadge>Simulated price</SimBadge>
            </div>
            <LiveQuote initial={q} size="sm" className="mt-3" />
          </div>
          <dl className="divide-y divide-hairline px-5 text-sm sm:px-6">
            {[
              ['Your shares', sharesFmt(portfolio.shares)],
              ['Average cost', portfolio.shares > 0 ? usdFmt(portfolio.avgCost) : '—'],
              ['Market value', usdFmt(portfolio.marketValue)],
              ['Unrealised gain', portfolio.shares > 0 ? `${signedUsd(portfolio.unrealizedPnl)} (${pct(portfolio.unrealizedPnlPct)})` : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-3">
                <dt className="text-muted">{k}</dt>
                <dd className={cn('num', k === 'Unrealised gain' && portfolio.shares > 0 ? (portfolio.unrealizedPnl >= 0 ? 'text-gain' : 'text-loss') : 'text-fg')}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-auto grid grid-cols-2 gap-2 p-5 sm:p-6">
            <ButtonLink href="/account/trade?side=buy" variant="light">Buy</ButtonLink>
            <ButtonLink href="/account/trade?side=sell" variant="ghost">Sell</ButtonLink>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent activity" action={<Link href="/account/transactions" className="text-[13px] text-muted hover:text-fg">View all activity</Link>} />
        {recent.length === 0 ? (
          <EmptyState icon={<Receipt className="size-6" />} title="No activity yet" description="Add funds to start building your portfolio." action={<ButtonLink href="/account/funding" size="sm">Add funds</ButtonLink>} />
        ) : (
          <TxTable rows={recent.map(toTxDTO)} hrefBase="/account/transactions" />
        )}
      </Card>
    </div>
  )
}
