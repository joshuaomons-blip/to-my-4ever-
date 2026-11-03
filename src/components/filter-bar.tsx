import { Search } from 'lucide-react'
import { buttonClass, inputClass } from '@/components/ui'
import { cn } from '@/lib/format'

export type FilterDef = { name: string; label: string; options: [string, string][] }

/** Plain GET form so filters are shareable URLs and work without JavaScript. */
export function FilterBar({ action, q, qPlaceholder, filters, values, extra }: { action: string; q?: string; qPlaceholder?: string; filters: FilterDef[]; values: Record<string, string | undefined>; extra?: React.ReactNode }) {
  return (
    <form action={action} className="flex flex-col gap-2 border-b border-white/[0.06] p-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-5">
      {qPlaceholder !== undefined && (
        <div className="relative sm:min-w-64 sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-dim" />
          <input name="q" defaultValue={q} placeholder={qPlaceholder} className={cn(inputClass, 'h-10 py-0 pl-10')} />
        </div>
      )}
      {filters.map((f) => (
        <select key={f.name} name={f.name} defaultValue={values[f.name] ?? ''} aria-label={f.label} className={cn(inputClass, 'h-10 appearance-none py-0 sm:w-auto')}>
          <option value="">{f.label}: All</option>
          {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ))}
      {extra}
      <div className="flex gap-2">
        <button className={buttonClass('light', 'md', 'h-10')}>Apply</button>
        <a href={action} className={buttonClass('ghost', 'md', 'h-10')}>Reset</a>
      </div>
    </form>
  )
}

export const TX_TYPE_FILTER: FilterDef = { name: 'type', label: 'Type', options: [['DEPOSIT', 'Deposits'], ['WITHDRAWAL', 'Withdrawals'], ['BUY', 'Buy orders'], ['SELL', 'Sell orders']] }
export const TX_STATUS_FILTER: FilterDef = { name: 'status', label: 'Status', options: [['PENDING', 'Pending'], ['COMPLETED', 'Completed'], ['REJECTED', 'Rejected'], ['CANCELLED', 'Cancelled']] }

export function qs(base: Record<string, string | undefined>, patch: Record<string, string | number | undefined>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}
