import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, Minus, Plus } from 'lucide-react'
import { StatusBadge, Table, td, th } from '@/components/ui'
import { cn, dateTimeFmt, sharesFmt, usdFmt } from '@/lib/format'

export type TxRow = {
  id: string
  reference: string
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'BUY' | 'SELL'
  status: string
  amount: number
  fee: number
  shares: number | null
  price: number | null
  method?: string | null
  isSeed?: boolean
  createdAt: string
  user?: { id: string; email: string; firstName: string; lastName: string }
}

export const TX_LABEL = { DEPOSIT: 'Deposit', WITHDRAWAL: 'Withdrawal', BUY: 'Buy TSLA', SELL: 'Sell TSLA' } as const
const ICON = { DEPOSIT: ArrowDownLeft, WITHDRAWAL: ArrowUpRight, BUY: Plus, SELL: Minus }

export function TxIcon({ type }: { type: TxRow['type'] }) {
  const I = ICON[type]
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center rounded-full border', type === 'DEPOSIT' || type === 'SELL' ? 'border-gain/20 bg-gain/10 text-gain' : type === 'BUY' ? 'border-accent/20 bg-accent/10 text-accent' : 'border-white/10 bg-white/[0.04] text-silver')}>
      <I className="size-3.5" />
    </span>
  )
}

export function signedAmount(t: Pick<TxRow, 'type' | 'amount' | 'fee'>) {
  // Cash impact from the customer's perspective.
  if (t.type === 'DEPOSIT') return t.amount
  if (t.type === 'SELL') return t.amount - t.fee
  if (t.type === 'BUY') return -(t.amount + t.fee)
  return -t.amount
}

export function TxDetail({ t }: { t: TxRow }) {
  if (t.type === 'BUY' || t.type === 'SELL') return <span className="num text-xs text-mute">{sharesFmt(t.shares)} sh @ {usdFmt(t.price)}</span>
  return <span className="text-xs text-mute">{t.method ?? 'Sandbox transfer'}</span>
}

export function TxTable({ rows, hrefBase, showCustomer, customerHref }: { rows: TxRow[]; hrefBase: string; showCustomer?: boolean; customerHref?: string }) {
  return (
    <>
      {/* Desktop table */}
      <Table className="hidden md:block">
        <thead className="border-b border-white/[0.06]">
          <tr>
            <th className={th}>Transaction</th>
            {showCustomer && <th className={th}>Customer</th>}
            <th className={th}>Reference</th>
            <th className={th}>Date</th>
            <th className={cn(th, 'text-right')}>Cash impact</th>
            <th className={cn(th, 'text-right')}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {rows.map((t) => {
            const amt = signedAmount(t)
            return (
              <tr key={t.id} className="group transition-colors hover:bg-white/[0.02]">
                <td className={td}>
                  <Link href={`${hrefBase}/${t.id}`} className="flex items-center gap-3">
                    <TxIcon type={t.type} />
                    <div>
                      <p className="text-sm font-medium text-white group-hover:underline">{TX_LABEL[t.type]}</p>
                      <TxDetail t={t} />
                    </div>
                  </Link>
                </td>
                {showCustomer && t.user && (
                  <td className={td}>
                    <Link href={`${customerHref}/${t.user.id}`} className="text-sm text-silver hover:text-white hover:underline">{t.user.firstName} {t.user.lastName}</Link>
                    <p className="text-[11px] text-dim">{t.user.email}</p>
                  </td>
                )}
                <td className={td}>
                  <span className="num text-xs text-silver">{t.reference}</span>
                  {t.isSeed && <span className="ml-2 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] uppercase text-dim">demo</span>}
                </td>
                <td className={cn(td, 'text-xs text-mute')}>{dateTimeFmt(t.createdAt)}</td>
                <td className={cn(td, 'num text-right text-sm', amt >= 0 ? 'text-gain' : 'text-white')}>
                  {amt >= 0 ? '+' : '−'}
                  {usdFmt(Math.abs(amt))}
                </td>
                <td className={cn(td, 'text-right')}><StatusBadge status={t.status} /></td>
              </tr>
            )
          })}
        </tbody>
      </Table>
      {/* Mobile list */}
      <ul className="divide-y divide-white/[0.05] md:hidden">
        {rows.map((t) => {
          const amt = signedAmount(t)
          return (
            <li key={t.id}>
              <Link href={`${hrefBase}/${t.id}`} className="flex items-center gap-3 px-5 py-4">
                <TxIcon type={t.type} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{TX_LABEL[t.type]}{showCustomer && t.user ? <span className="text-mute"> · {t.user.firstName} {t.user.lastName}</span> : null}</p>
                  <p className="truncate text-[11px] text-dim">{t.reference} · {dateTimeFmt(t.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className={cn('num text-sm', amt >= 0 ? 'text-gain' : 'text-white')}>{amt >= 0 ? '+' : '−'}{usdFmt(Math.abs(amt))}</p>
                  <div className="mt-1"><StatusBadge status={t.status} /></div>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
