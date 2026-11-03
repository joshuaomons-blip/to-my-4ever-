import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { getSettings } from '@/server/settings'
import { settleDueDeposits } from '@/server/services/ledger'
import { toTxDTO } from '@/server/services/portfolio'
import { Card, SimBadge, StatusBadge } from '@/components/ui'
import { TX_LABEL, TxIcon, signedAmount } from '@/components/app/tx-table'
import { PrintButton } from '@/components/app/print-button'
import { dateTimeFmt, sharesFmt, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Transaction receipt' }

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCustomerPage()
  const { id } = await params
  await settleDueDeposits(user.id)
  const row = await prisma.transaction.findFirst({ where: { id, userId: user.id } })
  if (!row) notFound()
  const t = toTxDTO(row)
  const { branding } = await getSettings()
  const amt = signedAmount(t)
  const lines: [string, string][] = [
    ['Reference', t.reference],
    ['Type', TX_LABEL[t.type]],
    ['Created', dateTimeFmt(t.createdAt)],
    ...(t.completedAt ? ([['Completed', dateTimeFmt(t.completedAt)]] as [string, string][]) : []),
    ...(t.type === 'BUY' || t.type === 'SELL'
      ? ([['Symbol', 'TSLA'], ['Shares', sharesFmt(t.shares)], ['Fill price', usdFmt(t.price)], ['Gross amount', usdFmt(t.amount)], ['Simulated fee', usdFmt(t.fee)]] as [string, string][])
      : ([['Amount', usdFmt(t.amount)], ['Method', t.method ?? 'Sandbox transfer']] as [string, string][])),
    ['Cash impact', `${amt >= 0 ? '+' : '−'}${usdFmt(Math.abs(amt))}`],
    ['Broker reference', t.brokerRef ?? 'Pending'],
    ...(t.customerNote ? ([['Your note', t.customerNote]] as [string, string][]) : []),
    ...(t.adminNote ? ([['Reviewer note', t.adminNote]] as [string, string][]) : []),
  ]
  return (
    <div className="mx-auto max-w-xl">
      <Link href="/app/transactions" className="mb-6 inline-flex items-center gap-1.5 text-sm text-mute hover:text-white print:hidden"><ArrowLeft className="size-4" /> All transactions</Link>
      <Card className="overflow-hidden print:border-black print:bg-white print:text-black">
        <div className="border-b border-white/[0.06] p-6 text-center sm:p-8">
          <div className="flex justify-center"><TxIcon type={t.type} /></div>
          <p className="eyebrow mt-4">{branding.platformName} · Transaction receipt</p>
          <p className="num mt-3 text-4xl font-medium">{amt >= 0 ? '+' : '−'}{usdFmt(Math.abs(amt))}</p>
          <div className="mt-3 flex items-center justify-center gap-2"><StatusBadge status={t.status} /><SimBadge>Simulated</SimBadge></div>
          {t.status === 'PENDING' && t.type === 'DEPOSIT' && <p className="mt-3 text-xs text-warn">Settling automatically. Refresh in a few seconds.</p>}
          {t.status === 'PENDING' && t.type === 'WITHDRAWAL' && <p className="mt-3 text-xs text-warn">Awaiting administrator review.</p>}
        </div>
        <dl className="divide-y divide-white/[0.05] px-6 sm:px-8">
          {lines.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-6 py-3 text-sm">
              <dt className="shrink-0 text-mute">{k}</dt>
              <dd className="num text-right break-all">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-white/[0.06] bg-ink/40 p-6 text-[11px] leading-relaxed text-dim sm:px-8">
          This receipt documents a simulated sandbox transaction. It is not a confirmation of a real securities trade or funds transfer and has no monetary value.
        </div>
      </Card>
      <div className="mt-4 flex justify-end print:hidden"><PrintButton /></div>
    </div>
  )
}
