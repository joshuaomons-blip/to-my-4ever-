'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Laptop, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react'
import { Alert, Badge, Button, Field, Input, RelTime } from '@/components/ui'
import { Modal } from '@/components/modal'
import { useForm } from '@/components/use-form'
import { useToast } from '@/components/toast'
import { PasswordMeter } from '@/components/auth/forms'
import { api } from '@/lib/api'

export function ChangePasswordForm({ endpoint }: { endpoint: string }) {
  const toast = useToast()
  const f = useForm({ currentPassword: '', newPassword: '', confirm: '' })
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (f.values.newPassword !== f.values.confirm) return f.setErrors({ confirm: 'Passwords do not match' })
    if (await f.submit(endpoint, { currentPassword: f.values.currentPassword, newPassword: f.values.newPassword })) {
      toast({ tone: 'success', title: 'Password updated', body: 'Other sessions were signed out.' })
      f.setValues({ currentPassword: '', newPassword: '', confirm: '' })
    }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <Field label="Current password" error={f.errors.currentPassword} htmlFor="cp"><Input id="cp" type="password" autoComplete="current-password" value={f.values.currentPassword} onChange={(e) => f.set('currentPassword', e.target.value)} invalid={!!f.errors.currentPassword} /></Field>
      <Field label="New password" error={f.errors.newPassword} htmlFor="np">
        <Input id="np" type="password" autoComplete="new-password" value={f.values.newPassword} onChange={(e) => f.set('newPassword', e.target.value)} invalid={!!f.errors.newPassword} />
        <PasswordMeter value={f.values.newPassword} />
      </Field>
      <Field label="Confirm new password" error={f.errors.confirm} htmlFor="np2"><Input id="np2" type="password" autoComplete="new-password" value={f.values.confirm} onChange={(e) => f.set('confirm', e.target.value)} invalid={!!f.errors.confirm} /></Field>
      <Button type="submit" loading={f.loading} variant="light">Update password</Button>
    </form>
  )
}

export function MfaCard({ apiBase, enabled, required }: { apiBase: string; enabled: boolean; required?: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null)
  const [disableOpen, setDisableOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const enable = useForm({ code: '' })
  const disable = useForm({ password: '', code: '' })

  async function start() {
    setStarting(true)
    setStartError(null)
    const r = await api<{ secret: string; qr: string }>(`${apiBase}/mfa/setup`, { method: 'POST' })
    setStarting(false)
    if (r.ok) setSetup(r.data)
    else setStartError(r.error)
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-4">
          <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${enabled ? 'bg-gain/10 text-gain' : 'bg-fg/[0.04] text-muted'}`}>{enabled ? <ShieldCheck className="size-5" /> : <ShieldOff className="size-5" />}</span>
          <div>
            <div className="flex items-center gap-2"><p className="font-medium">Authenticator app (TOTP)</p>{enabled ? <Badge tone="gain" dot>Enabled</Badge> : <Badge tone={required ? 'warn' : 'neutral'} dot>{required ? 'Required' : 'Off'}</Badge>}</div>
            <p className="mt-1 max-w-md text-sm text-muted">Require a 6-digit code from Google Authenticator, 1Password, Authy or similar at every sign-in.</p>
          </div>
        </div>
        {enabled ? <Button variant="ghost" onClick={() => setDisableOpen(true)}>Disable</Button> : !setup && <Button onClick={start} loading={starting}>Set up</Button>}
      </div>
      {startError && <Alert tone="loss" className="mt-4">{startError}</Alert>}

      {setup && !enabled && (
        <div className="mt-6 grid gap-6 rounded-lg border border-fg/[0.08] bg-canvas/50 p-5 sm:grid-cols-[180px_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="Scan this QR code with your authenticator app" className="size-44 rounded-md bg-fg p-2" />
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              if (await enable.submit(`${apiBase}/mfa/enable`, { code: enable.values.code })) {
                toast({ tone: 'success', title: 'Two-factor authentication enabled' })
                setSetup(null)
                router.refresh()
              }
            }}
          >
            <ol className="list-decimal space-y-1 pl-4 text-sm text-muted">
              <li>Scan the QR code with your authenticator app.</li>
              <li>Or enter this key manually: <code className="num block break-all text-xs text-fg-2">{setup.secret}</code></li>
              <li>Enter the 6-digit code to confirm.</li>
            </ol>
            {enable.error && <Alert tone="loss">{enable.error}</Alert>}
            <div className="flex gap-2">
              <Input inputMode="numeric" maxLength={6} placeholder="000000" className="num max-w-40 text-center tracking-[0.3em]" value={enable.values.code} onChange={(e) => enable.set('code', e.target.value.replace(/\D/g, ''))} aria-label="Authentication code" />
              <Button type="submit" loading={enable.loading} disabled={enable.values.code.length !== 6}>Verify & enable</Button>
            </div>
          </form>
        </div>
      )}

      <Modal open={disableOpen} onClose={() => setDisableOpen(false)} title="Disable two-factor authentication">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await disable.submit(`${apiBase}/mfa/disable`, disable.values)) {
              toast({ tone: 'success', title: 'Two-factor authentication disabled' })
              setDisableOpen(false)
              router.refresh()
            }
          }}
        >
          {disable.error && <Alert tone="loss">{disable.error}</Alert>}
          <Field label="Password" error={disable.errors.password} htmlFor="dpw"><Input id="dpw" type="password" autoComplete="current-password" value={disable.values.password} onChange={(e) => disable.set('password', e.target.value)} /></Field>
          <Field label="Current authentication code" error={disable.errors.code} htmlFor="dcode"><Input id="dcode" inputMode="numeric" maxLength={6} className="num tracking-[0.3em]" value={disable.values.code} onChange={(e) => disable.set('code', e.target.value.replace(/\D/g, ''))} /></Field>
          <Button type="submit" variant="danger" loading={disable.loading} className="w-full">Disable 2FA</Button>
        </form>
      </Modal>
    </div>
  )
}

export function SessionsList({ endpoint, sessions, currentId }: { endpoint: string; sessions: { id: string; ip: string | null; userAgent: string | null; lastSeenAt: string; createdAt: string }[]; currentId: string | null }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  async function revoke(body: object, key: string) {
    setBusy(key)
    const r = await api(endpoint, { method: 'DELETE', body })
    setBusy(null)
    if (r.ok) {
      toast({ tone: 'success', title: 'Session signed out' })
      router.refresh()
    } else toast({ tone: 'error', title: r.error })
  }
  const device = (ua: string | null) => {
    if (!ua) return 'Unknown device'
    const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /node|curl|undici/i.test(ua) ? 'API client' : 'Browser'
    const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
    return `${browser}${os ? ` on ${os}` : ''}`
  }
  return (
    <div>
      <ul className="divide-y divide-fg/[0.05]">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-4 py-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-fg/[0.04] text-muted">{/Mobile|iPhone|Android/.test(s.userAgent ?? '') ? <Smartphone className="size-4" /> : <Laptop className="size-4" />}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">{device(s.userAgent)} {s.id === currentId && <Badge tone="gain" className="ml-1">This device</Badge>}</p>
              <p className="text-[11px] text-faint">{s.ip ?? 'unknown IP'} · active <RelTime date={s.lastSeenAt} /></p>
            </div>
            {s.id !== currentId && <Button size="sm" variant="ghost" loading={busy === s.id} onClick={() => revoke({ sessionId: s.id }, s.id)}>Sign out</Button>}
          </li>
        ))}
      </ul>
      {sessions.length > 1 && <Button size="sm" variant="ghost" className="mt-3" loading={busy === 'all'} onClick={() => revoke({ allOthers: true }, 'all')}>Sign out all other sessions</Button>}
    </div>
  )
}
