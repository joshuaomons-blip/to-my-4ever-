import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CircleCheck, CircleX, Clock } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { sweepDeposits } from '@/server/payments/service'
import { paymentsConfig } from '@/server/payments/config'
import { Alert, ButtonLink, Card, CardHeader, StatusBadge } from '@/components/ui'
import { AutoRefresh, DepositActions } from '@/components/app/deposit-forms'
import { dateTimeFmt, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Deposit' }

export default async function DepositPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return?: string }> }) {
  const user = await requireCustomerPage()
  const { id } = await params
  const sp = await searchParams
  await sweepDeposits(user.id)
  const d = await prisma.depositRequest.findFirst({ where: { id, userId: user.id } })
  if (!d) notFound()
  const instructions = (d.instructions as Record<string, string> | null) ?? null
  const open = d.status === 'AWAITING_PAYMENT' || d.status === 'PROCESSING'
  const testMode = paymentsConfig().provider === 'test' && d.provider === 'test'

  return (
    <div className="mx-auto max-w-3xl">
      <AutoRefresh active={open && (d.method === 'CARD' || d.status === 'PROCESSING' || sp.return === 'success')} everyMs={4000} />
      <Link href="/account/funding" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Add funds
      </Link>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline p-6">
          <div>
            <p className="text-[13px] text-muted">{d.method === 'CARD' ? 'Card payment' : 'Bank transfer'}</p>
            <p className="num display mt-1 text-[34px] leading-none font-semibold">{usdFmt(Number(d.amount))}</p>
            <p className="mt-2 font-mono text-[14px] text-fg-2">{d.reference}</p>
          </div>
          <StatusBadge status={d.status} />
        </div>

        <div className="space-y-5 p-6">
          {d.status === 'SUCCEEDED' && (
            <Alert tone="gain" icon={<CircleCheck className="size-5" />} title="Payment confirmed">
              {usdFmt(Number(d.receivedAmount))} was confirmed by the payment provider on {dateTimeFmt(d.succeededAt!)} and added to your cash balance.
              {d.transactionId && (
                <>
                  {' '}
                  <Link className="underline" href={`/account/transactions/${d.transactionId}`}>View receipt</Link>
                </>
              )}
            </Alert>
          )}
          {d.status === 'PROCESSING' && (
            <Alert tone="info" icon={<Clock className="size-5" />} title="Payment processing">
              The provider has received your payment and is completing it. Bank debits can take a few business days. This page updates automatically.
            </Alert>
          )}
          {(d.status === 'FAILED' || d.status === 'EXPIRED' || d.status === 'CANCELLED') && (
            <Alert tone={d.status === 'FAILED' ? 'loss' : 'neutral'} icon={<CircleX className="size-5" />} title={d.status === 'FAILED' ? 'Payment failed' : d.status === 'EXPIRED' ? 'Deposit expired' : 'Deposit cancelled'}>
              {d.failureReason ?? 'No money was taken.'} Nothing was added to your balance.
            </Alert>
          )}
          {d.status === 'AWAITING_PAYMENT' && d.method === 'CARD' && (
            <p className="text-[15px] leading-relaxed text-fg-2">Complete the payment on the provider’s secure page. If you closed it, continue below. This deposit expires {dateTimeFmt(d.expiresAt)}.</p>
          )}

          {d.status === 'AWAITING_PAYMENT' && d.method === 'BANK_TRANSFER' && instructions && (
            <section>
              <h2 className="text-[15px] font-semibold">Send a bank transfer with these details</h2>
              <p className="mt-1 text-[14px] text-muted">Include the payment reference exactly, so the transfer is matched to your account. Details valid until {dateTimeFmt(d.expiresAt)}.</p>
              <dl className="mt-4 divide-y divide-hairline rounded-md border border-hairline">
                {Object.entries(instructions).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[150px_1fr] gap-4 px-4 py-2.5 text-[14px] sm:grid-cols-[200px_1fr]">
                    <dt className="text-muted">{k}</dt>
                    <dd className={k === 'Payment reference' ? 'font-mono font-semibold text-fg' : 'num text-fg'}>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <DepositActions id={d.id} status={d.status} method={d.method} checkoutUrl={d.checkoutUrl} testMode={testMode} />

          {!open && (
            <div className="flex gap-2">
              <ButtonLink href="/account/funding" variant="light">Start a new deposit</ButtonLink>
              <ButtonLink href="/account" variant="ghost">Back to overview</ButtonLink>
            </div>
          )}
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Details" />
        <dl className="divide-y divide-hairline px-6 text-[14px]">
          {[
            ['Started', dateTimeFmt(d.createdAt)],
            ['Payment provider', d.provider === 'test' ? 'Test provider (no real money)' : `Stripe${d.livemode ? '' : ' (test mode)'}`],
            ['Amount requested', usdFmt(Number(d.amount))],
            ['Amount received', d.receivedAmount ? usdFmt(Number(d.receivedAmount)) : 'Not yet received'],
            ['Expires', dateTimeFmt(d.expiresAt)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-6 py-3">
              <dt className="text-muted">{k}</dt>
              <dd className="num text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  )
}
