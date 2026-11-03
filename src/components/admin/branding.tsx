'use client'

import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import { ImageUp, Trash2 } from 'lucide-react'
import { Alert, Button, Field, Input } from '@/components/ui'
import { LogoMark } from '@/components/brand'
import { useForm } from '@/components/use-form'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/format'

export function BrandingForm({ initial }: { initial: { platformName: string; tagline: string; logoDataUrl: string } }) {
  const router = useRouter()
  const toast = useToast()
  const f = useForm(initial)
  const fileRef = useRef<HTMLInputElement>(null)

  function onFile(file: File | undefined) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return f.setErrors({ logoDataUrl: 'Use a PNG, JPEG or WebP image' })
    if (file.size > 200_000) return f.setErrors({ logoDataUrl: 'Logo must be under 200 KB' })
    const reader = new FileReader()
    reader.onload = () => f.set('logoDataUrl', String(reader.result))
    reader.readAsDataURL(file)
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await f.submit('/api/admin/settings/branding', { value: f.values }, 'PUT')) {
          toast({ tone: 'success', title: 'Branding updated' })
          router.refresh()
        }
      }}
    >
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <Field label="Logo" error={f.errors.logoDataUrl} hint="Square PNG, JPEG or WebP, under 200 KB. Leave empty to use the default mark.">
        <div className="flex items-center gap-4">
          <div className="grid size-16 place-items-center rounded-2xl border border-white/10 bg-ink">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {f.values.logoDataUrl ? <img src={f.values.logoDataUrl} alt="Logo preview" className="size-12 rounded-lg object-contain" /> : <LogoMark className="size-10" />}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Upload logo" />
          <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()}><ImageUp className="size-3.5" /> Upload</Button>
          {f.values.logoDataUrl && <Button type="button" size="sm" variant="ghost" onClick={() => f.set('logoDataUrl', '')}><Trash2 className="size-3.5" /> Remove</Button>}
        </div>
      </Field>
      <Field label="Platform name" error={f.errors.platformName} htmlFor="br-name" hint="Shown in the header, emails, statements and browser title.">
        <Input id="br-name" maxLength={40} value={f.values.platformName} onChange={(e) => f.set('platformName', e.target.value)} invalid={!!f.errors.platformName} />
      </Field>
      <Field label="Tagline" error={f.errors.tagline} htmlFor="br-tag"><Input id="br-tag" maxLength={80} value={f.values.tagline} onChange={(e) => f.set('tagline', e.target.value)} /></Field>
      <Alert tone="neutral">The sandbox disclosure and “not affiliated with Tesla, Inc.” notice are fixed and always displayed, whatever the branding.</Alert>
      <Button type="submit" variant="light" loading={f.loading}>Save branding</Button>
    </form>
  )
}

export function AppearanceForm({ initial, accents }: { initial: { accent: string; heroStyle: string }; accents: Record<string, { label: string; hex: string }> }) {
  const router = useRouter()
  const toast = useToast()
  const f = useForm(initial)
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await f.submit('/api/admin/settings/appearance', { value: f.values }, 'PUT')) {
          toast({ tone: 'success', title: 'Appearance updated' })
          router.refresh()
        }
      }}
    >
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <div>
        <p className="mb-2 text-xs font-medium text-silver">Accent colour</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(accents).map(([k, a]) => (
            <button key={k} type="button" onClick={() => f.set('accent', k)} className={cn('flex items-center gap-2.5 rounded-xl border p-3 text-left text-xs transition-all', f.values.accent === k ? 'border-white/40 bg-white/[0.05]' : 'border-white/[0.08] hover:border-white/20')}>
              <span className="size-5 rounded-full ring-2 ring-white/10" style={{ background: a.hex }} />
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-silver">Homepage hero background</p>
        <div className="grid grid-cols-3 gap-2">
          {[['grid', 'Grid + glow'], ['aurora', 'Aurora'], ['minimal', 'Minimal']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => f.set('heroStyle', k)} className={cn('rounded-xl border px-3 py-2.5 text-xs transition-all', f.values.heroStyle === k ? 'border-white/40 bg-white/[0.05] text-white' : 'border-white/[0.08] text-mute hover:text-white')}>{l}</button>
          ))}
        </div>
      </div>
      <Button type="submit" variant="light" loading={f.loading}>Save appearance</Button>
    </form>
  )
}
