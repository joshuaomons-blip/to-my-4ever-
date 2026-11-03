'use client'

import { useState } from 'react'
import { Download, FileBarChart, FileText } from 'lucide-react'
import { Button, Field, Input } from '@/components/ui'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/format'

const iso = (d: Date) => d.toISOString().slice(0, 10)

export function StatementForm({ since }: { since: string }) {
  const [today] = useState(() => new Date())
  const presets: [string, string, string][] = [
    ['Last 30 days', iso(new Date(today.getTime() - 30 * 86_400_000)), iso(today)],
    ['This month', iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), iso(today)],
    ['Year to date', iso(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))), iso(today)],
    ['All time', since, iso(today)],
  ]
  const [kind, setKind] = useState<'summary' | 'transactions'>('summary')
  const [from, setFrom] = useState(presets[0][1])
  const [to, setTo] = useState(presets[0][2])
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const invalid = !from || !to || from > to

  async function download() {
    setBusy(true)
    try {
      const res = await fetch(`/api/statements?kind=${kind}&from=${from}&to=${to}`, { credentials: 'same-origin' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Could not generate statement')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sandbox-${kind}-${from}_${to}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      toast({ tone: 'success', title: 'Statement downloaded' })
    } catch (e) {
      toast({ tone: 'error', title: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ['summary', FileBarChart, 'Portfolio summary', 'Balances, holdings, P/L and period activity'],
          ['transactions', FileText, 'Transaction report', 'Itemised list of every transaction in the period'],
        ] as const).map(([k, Icon, title, sub]) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={cn('flex gap-4 rounded-2xl border p-5 text-left transition-all', kind === k ? 'border-accent/50 bg-accent/[0.05]' : 'border-white/[0.08] hover:border-white/15')}>
            <Icon className={cn('size-5 shrink-0', kind === k ? 'text-accent' : 'text-mute')} />
            <span>
              <span className="block text-sm font-medium">{title}</span>
              <span className="mt-1 block text-xs text-mute">{sub}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map(([label, f, t]) => (
          <button key={label} type="button" onClick={() => { setFrom(f); setTo(t) }} className={cn('rounded-full border px-3 py-1 text-xs transition-colors', from === f && to === t ? 'border-white bg-white text-ink' : 'border-white/[0.08] text-mute hover:text-white')}>{label}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From" htmlFor="st-from"><Input id="st-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To" htmlFor="st-to" error={invalid ? 'End date must be after start date' : undefined}><Input id="st-to" type="date" value={to} min={from} max={iso(today)} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <Button size="lg" onClick={download} loading={busy} disabled={invalid} className="w-full sm:w-auto"><Download className="size-4" /> Download PDF</Button>
    </div>
  )
}
