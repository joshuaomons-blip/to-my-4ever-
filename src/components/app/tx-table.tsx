import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, Minus, Plus, Scale } from 'lucide-react'
import { StatusBadge, Table, td, th } from '@/components/ui'
import { cn, dateTimeFmt, sharesFmt, usdFmt } from '@/lib/format'

export type TxType = 'DEPOSIT' | 'WITHDRAWAL' | 'BUY' | 'SELL' | 'ADJUSTMENT'
export type TxRow = {
  id: string
  reference: string
  type: TxType
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

export const TX_LABEL: Record<TxType, string> = { DEPOSIT: 'Deposit', WITHDRAWAL: 'Withdrawal', BUY: 'Buy TSLA', SELL: 'Sell TSLA', ADJUSTMENT: 'Balance correction' }
const ICON = { DEPOSIT: ArrowDownLeft, WITHDRAWAL: ArrowUpRight, BUY: Plus, SELL: Minus, ADJUSTMENT: Scale }

export function TxIcon({ type }: { type: TxType }) {
  const I = ICON[type]
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-md border border-hairline bg-surface-2 text-fg-2">
      <I className="size-4" />
    </span>
  )
}

/** Cash impact from the customer's point of view. */
export function signedAmount(t: Pick<TxRow, 'type' | 'amount' | 'fee'>) {
  if (t.type === 'DEPOSIT') return t.amount
  if (t.type === 'SELL') return t.amount - t.fee
  if (t.type === 'BUY') return -(t.amount + t.fee)
  if (t.type === 'ADJUSTMENT') return t.amount
  return -t.amount
}

export function TxDetail({ t }: { t: TxRow }) {
  if (t.type === 'BUY' || t.type === 'SELL') return <span className="num text-[13px] text-muted">{sharesFmt(t.shares)} shares at {usdFmt(t.price)} (simulated)</span>
  return <span className="text-[13px] text-muted">{t.method ?? 'Transfer'}</span>
}

const Amount = ({ v }: { v: number }) => (
  <span className={cn('num', v >= 0 ? 'text-gain' : 'text-fg')}>
    {v >= 0 ? '+' : '−'}
    {usdFmt(Math.abs(v))}
  </span>
)

export function TxTable({ rows, hrefBase, showCustomer, customerHref }: { rows: TxRow[]; hrefBase: string; showCustomer?: boolean; customerHref?: string }) {
  return (
    <>
      <Table className="hidden md:block">
        <thead className="border-b border-hairline">
          <tr>
            <th className={th}>Transaction</th>
            {showCustomer && <th className={th}>Customer</th>}
            <th className={th}>Reference</th>
            <th className={th}>Date</th>
            <th className={cn(th, 'text-right')}>Cash impact</th>
            <th className={cn(th, 'text-right')}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((t) => (
            <tr key={t.id} className="group hover:bg-surface-2">
              <td className={td}>
                <Link href={`${hrefBase}/${t.id}`} className="flex items-center gap-3">
                  <TxIcon type={t.type} />
                  <span>
                    <span className="block text-sm font-medium text-fg group-hover:underline">{TX_LABEL[t.type]}</span>
                    <TxDetail t={t} />
                  </span>
                </Link>
              </td>
              {showCustomer && t.user && (
                <td className={td}>
                  <Link href={`${customerHref}/${t.user.id}`} className="text-sm text-fg hover:underline">
                    {t.user.firstName} {t.user.lastName}
                  </Link>
                  <p className="text-[13px] text-muted">{t.user.email}</p>
                </td>
              )}
              <td className={td}>
                <span className="font-mono text-[13px] text-fg-2">{t.reference}</span>
                {t.isSeed && <span className="ml-2 rounded-sm bg-surface-3 px-1 text-[11px] text-muted">demo</span>}
              </td>
              <td className={cn(td, 'text-[13px] text-muted')}>{dateTimeFmt(t.createdAt)}</td>
              <td className={cn(td, 'text-right text-sm')}>
                <Amount v={signedAmount(t)} />
              </td>
              <td className={cn(td, 'text-right')}>
                <StatusBadge status={t.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <ul className="divide-y divide-hairline md:hidden">
        {rows.map((t) => (
          <li key={t.id}>
            <Link href={`${hrefBase}/${t.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2">
              <TxIcon type={t.type} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {TX_LABEL[t.type]}
                  {showCustomer && t.user ? <span className="font-normal text-muted"> for {t.user.firstName} {t.user.lastName}</span> : null}
                </p>
                <p className="truncate text-[13px] text-muted">{dateTimeFmt(t.createdAt)}</p>
              </div>
              <div className="text-right text-sm">
                <Amount v={signedAmount(t)} />
                <div className="mt-1">
                  <StatusBadge status={t.status} />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
