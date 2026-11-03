import type { Metadata } from 'next'
import Link from 'next/link'
import { CircleCheck, CircleDashed, CircleX } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireAdminPage } from '@/server/auth/session'
import { getSettings } from '@/server/settings'
import { paymentsConfig, brandingBlocksLive } from '@/server/payments/config'
import { getBroker } from '@/server/broker'
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, Table, td, th } from '@/components/ui'
import { PaymentSimulator } from '@/components/admin/money-tools'
import { cn, dateTimeFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Payment provider' }

export default async function PaymentsPage() {
  await requireAdminPage('payments:review')
  const cfg = paymentsConfig()
  const { branding } = await getSettings()
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const events = await prisma.paymentEvent.findMany({ orderBy: { receivedAt: 'desc' }, take: 25, include: { deposit: { select: { id: true, reference: true } } } })
  const checks: [boolean | null, string, string][] = [
    [cfg.provider === 'stripe', 'Payment provider selected', 'Set PAYMENT_PROVIDER="stripe" (currently "' + cfg.provider + '").'],
    [cfg.provider === 'stripe' ? cfg.status !== 'misconfigured' : null, 'API keys configured', 'STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the server environment, never in browser code.'],
    [null, 'Webhook endpoint registered', `In Stripe, add ${appUrl}/api/webhooks/payments/stripe with the four checkout.session events listed in the README.`],
    [cfg.livemode ? true : null, 'Live keys', 'sk_live_ keys switch Stripe to real money. Test with sk_test_ keys first.'],
    [process.env.PAYMENTS_LIVE_ENABLED === 'true' ? true : cfg.livemode ? false : null, 'Live funding switched on', 'PAYMENTS_LIVE_ENABLED="true" after the compliance checklist is complete.'],
    [!brandingBlocksLive(branding.platformName), 'Platform name clear of third-party trademarks', `Current name: “${branding.platformName}”. Live payments stay disabled while it uses “Tesla”.`],
    [!getBroker().simulated ? true : false, 'Licensed brokerage connected', 'Without one, trading is disabled whenever live payments are on, so real money never buys simulated shares.'],
  ]
  return (
    <>
      <PageHeader title="Payment provider" description="How deposits are processed, what is needed to accept real payments, and every webhook the platform has received." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Current configuration"
            action={<Badge tone={cfg.provider === 'test' ? 'warn' : cfg.livemode && cfg.status === 'ready' ? 'gain' : 'info'} dot>{cfg.provider === 'test' ? 'Test provider' : cfg.livemode ? 'Stripe live' : 'Stripe test mode'}</Badge>}
          />
          <div className="space-y-4 p-6 text-[14px] leading-relaxed text-fg-2">
            {cfg.provider === 'test' ? (
              <p>
                The built-in <strong className="text-fg">test provider</strong> is active. It issues payment sessions, keeps its own payment records and sends signed webhooks, so the whole pipeline (signature check, independent re-check, duplicate protection, failure handling) runs exactly as it will with a real provider. No real money moves.
              </p>
            ) : (
              <p>Stripe Checkout handles card payments and US bank account debits. Card and bank details are entered on Stripe’s pages and never reach this server.</p>
            )}
            {cfg.message && <Alert tone="warn">{cfg.message}</Alert>}
            <p className="text-[13px] text-muted">Webhook endpoint: <span className="font-mono text-fg">{appUrl}/api/webhooks/payments/{cfg.provider}</span></p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Go-live checklist" subtitle="Real payments are refused until every required item is in place" />
          <ul className="divide-y divide-hairline">
            {checks.map(([ok, title, body]) => (
              <li key={title} className="flex gap-3 px-6 py-3">
                {ok === true ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-gain" /> : ok === false ? <CircleX className="mt-0.5 size-4 shrink-0 text-loss" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-faint" />}
                <div>
                  <p className="text-[14px] font-medium">{title}</p>
                  <p className="text-[13px] text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="border-t border-hairline px-6 py-3 text-[13px] text-muted">
            Holding customer money for investment also requires the licences and agreements described in the README (broker-dealer partner, money-transmission or e-money permissions, KYC/AML provider). Software settings alone do not make it lawful.
          </p>
        </Card>
      </div>

      {cfg.provider === 'test' && (
        <Card className="mt-6">
          <CardHeader title="Test payment simulator" subtitle="Make the test provider receive a bank transfer for a deposit reference. Unavailable when a real provider is configured." />
          <div className="p-6"><PaymentSimulator /></div>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Recent webhook events" action={<Link href="/admin/deposits" className="text-[13px] text-muted hover:text-fg">All deposits</Link>} />
        {events.length === 0 ? (
          <EmptyState title="No webhook events yet" />
        ) : (
          <Table>
            <thead className="border-b border-hairline">
              <tr><th className={th}>Received</th><th className={th}>Provider</th><th className={th}>Event</th><th className={th}>Deposit</th><th className={th}>Verified</th><th className={th}>Outcome</th><th className={th}>Detail</th></tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className={cn(td, 'text-[13px] text-muted')}>{dateTimeFmt(e.receivedAt)}</td>
                  <td className={cn(td, 'text-[13px]')}>{e.provider}</td>
                  <td className={cn(td, 'font-mono text-[13px]')}>{e.type}</td>
                  <td className={td}>{e.deposit ? <Link href={`/admin/deposits/${e.deposit.id}`} className="font-mono text-[13px] underline">{e.deposit.reference}</Link> : <span className="text-faint">—</span>}</td>
                  <td className={cn(td, 'text-[13px]')}>{e.verified ? 'Yes' : 'No'}</td>
                  <td className={cn(td, 'text-[13px] font-medium', e.outcome === 'processed' ? 'text-gain' : e.outcome === 'rejected' || e.outcome === 'error' ? 'text-loss' : 'text-muted')}>{e.outcome}</td>
                  <td className={cn(td, 'max-w-64 truncate text-[13px] text-muted')} title={e.message ?? ''}>{e.message ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
