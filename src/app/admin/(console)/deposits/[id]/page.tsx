import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireAdminPage } from '@/server/auth/session'
import { Alert, Card, CardHeader, EmptyState, StatusBadge, Table, td, th } from '@/components/ui'
import { ReverifyButton } from '@/components/admin/money-tools'
import { cn, dateTimeFmt, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Deposit' }

const OUTCOME_TONE: Record<string, string> = { processed: 'text-gain', duplicate: 'text-muted', ignored: 'text-muted', rejected: 'text-loss', error: 'text-loss', received: 'text-warn' }

export default async function AdminDepositPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage('payments:review')
  const { id } = await params
  const d = await prisma.depositRequest.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true } }, events: { orderBy: { receivedAt: 'asc' } } },
  })
  if (!d) notFound()
  const audit = await prisma.auditLog.findMany({ where: { targetType: 'deposit', targetId: id }, orderBy: { createdAt: 'asc' } })
  const rows: [string, React.ReactNode][] = [
    ['Reference', <span key="r" className="font-mono">{d.reference}</span>],
    ['Customer', <Link key="c" href={`/admin/customers/${d.user.id}`} className="underline">{d.user.firstName} {d.user.lastName} ({d.user.email})</Link>],
    ['Method', d.method === 'CARD' ? 'Card' : 'Bank transfer'],
    ['Provider', `${d.provider} (${d.livemode ? 'live' : 'test'})`],
    ['Provider session', <span key="s" className="font-mono text-[13px]">{d.providerSessionId ?? '—'}</span>],
    ['Provider payment', <span key="p" className="font-mono text-[13px]">{d.providerPaymentId ?? '—'}</span>],
    ['Amount requested', usdFmt(Number(d.amount))],
    ['Amount received', d.receivedAmount ? usdFmt(Number(d.receivedAmount)) : '—'],
    ['Refunded', usdFmt(Number(d.refundedAmount))],
    ['Ledger entry', d.transactionId ? <Link key="t" href={`/admin/transactions/${d.transactionId}`} className="underline">View transaction</Link> : 'None (not credited)'],
    ['Started', dateTimeFmt(d.createdAt)],
    ['Expires', dateTimeFmt(d.expiresAt)],
    ['Failure reason', d.failureReason ?? '—'],
  ]
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/deposits" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> Deposits</Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted">Deposit</p>
          <h1 className="num display text-[32px] font-semibold">{usdFmt(Number(d.amount))}</h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={d.status} />
          {d.providerSessionId && <ReverifyButton id={d.id} />}
        </div>
      </div>
      <Alert tone="neutral" className="mb-6">
        Funds are credited only by the webhook pipeline after the provider confirms payment. “Re-check with provider” asks the provider for its current status and applies it; it cannot mark a payment as received on its own.
      </Alert>
      <Card>
        <CardHeader title="Details" />
        <dl className="divide-y divide-hairline px-6 text-[14px]">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[180px_1fr] gap-4 py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="num break-all">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Payment provider events" subtitle="Every webhook received for this deposit, with signature and verification results" />
        {d.events.length === 0 ? (
          <EmptyState title="No events received yet" />
        ) : (
          <Table>
            <thead className="border-b border-hairline">
              <tr><th className={th}>Received</th><th className={th}>Event</th><th className={th}>Signature</th><th className={th}>Confirmed with provider</th><th className={th}>Outcome</th><th className={th}>Detail</th></tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {d.events.map((e) => (
                <tr key={e.id}>
                  <td className={cn(td, 'text-[13px] text-muted')}>{dateTimeFmt(e.receivedAt)}</td>
                  <td className={cn(td, 'font-mono text-[13px]')}>{e.type}</td>
                  <td className={cn(td, 'text-[13px]')}>{e.type === 'admin.reverify' ? 'n/a (admin check)' : e.signatureValid ? 'Valid' : 'Invalid'}</td>
                  <td className={cn(td, 'text-[13px]')}>{e.verified ? 'Yes' : 'No'}</td>
                  <td className={cn(td, 'text-[13px] font-medium', OUTCOME_TONE[e.outcome] ?? '')}>{e.outcome}</td>
                  <td className={cn(td, 'max-w-72 truncate text-[13px] text-muted')} title={e.message ?? ''}>{e.message ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card className="mt-6">
        <CardHeader title="Audit trail" />
        {audit.length === 0 ? <EmptyState title="No audit events" /> : (
          <ol className="space-y-2 px-6 py-4">
            {audit.map((a) => (
              <li key={a.id} className="text-[13px]"><span className="font-mono text-fg">{a.action}</span> <span className="text-muted">· {a.actorEmail ?? 'system'} · {dateTimeFmt(a.createdAt)}</span></li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  )
}
