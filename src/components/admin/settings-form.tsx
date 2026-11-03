'use client'

import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui'
import { useForm } from '@/components/use-form'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/format'

export type FieldDef =
  | { name: string; label: string; type: 'text' | 'email' | 'textarea'; hint?: string; maxLength?: number; rows?: number }
  | { name: string; label: string; type: 'number'; hint?: string; step?: string; min?: number; max?: number; prefix?: string; suffix?: string }
  | { name: string; label: string; type: 'toggle'; hint?: string }
  | { name: string; label: string; type: 'select'; options: [string, string][]; hint?: string }

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6 rounded-2xl border border-white/[0.08] p-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-mute">{hint}</span>}
      </span>
      <span className="relative mt-0.5 shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="block h-6 w-11 rounded-full bg-white/10 transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent" />
        <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

/** Generic editor for one settings key. Values are validated server-side with the same zod schema. */
export function SettingsForm({ settingKey, initial, fields, cols = 1, submitLabel = 'Save changes' }: { settingKey: string; initial: Record<string, unknown>; fields: FieldDef[]; cols?: 1 | 2; submitLabel?: string }) {
  const router = useRouter()
  const toast = useToast()
  const f = useForm(initial)
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await f.submit(`/api/admin/settings/${settingKey}`, { value: f.values }, 'PUT')) {
          toast({ tone: 'success', title: 'Saved', body: 'Changes are live.' })
          router.refresh()
        }
      }}
    >
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <div className={cn('grid gap-4', cols === 2 && 'sm:grid-cols-2')}>
        {fields.map((d) => {
          const v = f.values[d.name]
          const err = f.errors[d.name]
          if (d.type === 'toggle') return <div key={d.name} className={cn(cols === 2 && 'sm:col-span-2')}><Toggle label={d.label} hint={d.hint} checked={!!v} onChange={(x) => f.set(d.name, x as never)} /></div>
          return (
            <Field key={d.name} label={d.label} hint={d.hint} error={err} htmlFor={`${settingKey}-${d.name}`} className={cn(d.type === 'textarea' && cols === 2 && 'sm:col-span-2')}>
              {d.type === 'textarea' ? (
                <Textarea id={`${settingKey}-${d.name}`} rows={d.rows ?? 4} maxLength={d.maxLength} value={String(v ?? '')} onChange={(e) => f.set(d.name, e.target.value as never)} invalid={!!err} />
              ) : d.type === 'select' ? (
                <Select id={`${settingKey}-${d.name}`} value={String(v)} onChange={(e) => f.set(d.name, e.target.value as never)}>
                  {d.options.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
                </Select>
              ) : d.type === 'number' ? (
                <div className="relative">
                  {d.prefix && <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-dim">{d.prefix}</span>}
                  <Input id={`${settingKey}-${d.name}`} type="number" step={d.step ?? '1'} min={d.min} max={d.max} className={cn('num', d.prefix && 'pl-7', d.suffix && 'pr-14')} value={String(v ?? '')} onChange={(e) => f.set(d.name, (e.target.value === '' ? '' : Number(e.target.value)) as never)} invalid={!!err} />
                  {d.suffix && <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs text-dim">{d.suffix}</span>}
                </div>
              ) : (
                <Input id={`${settingKey}-${d.name}`} type={d.type} maxLength={d.maxLength} value={String(v ?? '')} onChange={(e) => f.set(d.name, e.target.value as never)} invalid={!!err} />
              )}
            </Field>
          )
        })}
      </div>
      <Button type="submit" variant="light" loading={f.loading}>{submitLabel}</Button>
    </form>
  )
}
