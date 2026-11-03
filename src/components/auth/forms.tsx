'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { CircleCheck, Eye, EyeOff, MailCheck } from 'lucide-react'
import { Alert, Button, Field, Input } from '@/components/ui'
import { useForm } from '@/components/use-form'
import { api } from '@/lib/api'
import { cn } from '@/lib/format'

type Scope = 'customer' | 'admin'
const home = (s: Scope) => (s === 'admin' ? '/admin' : '/account')
const loginPath = (s: Scope) => (s === 'admin' ? '/admin/login' : '/login')

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="pr-10" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-faint hover:text-fg" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export function PasswordMeter({ value }: { value: string }) {
  const checks = [value.length >= 12, /[a-z]/.test(value) && /[A-Z]/.test(value), /\d/.test(value), value.length >= 16 || /[^A-Za-z0-9]/.test(value)]
  const score = checks.filter(Boolean).length
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i < score ? (score <= 2 ? 'bg-warn' : 'bg-gain') : 'bg-fg/10')} />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-faint">12+ characters with upper and lower case letters and a number.</p>
    </div>
  )
}

export function LoginForm({ scope, next }: { scope: Scope; next?: string }) {
  const router = useRouter()
  const f = useForm({ email: '', password: '' })
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = await f.submit<{ mfa: boolean }>(scope === 'admin' ? '/api/admin/auth/login' : '/api/auth/login', f.values)
    if (!res) return
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') && next.startsWith(home(scope)) ? next : home(scope)
    if (res.mfa) router.push(`${scope === 'admin' ? '/admin/mfa' : '/login/mfa'}?next=${encodeURIComponent(safeNext)}`)
    else {
      router.push(safeNext)
      router.refresh()
    }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <Field label="Email" error={f.errors.email} htmlFor="email">
        <Input id="email" type="email" autoComplete="email" value={f.values.email} onChange={(e) => f.set('email', e.target.value)} invalid={!!f.errors.email} required />
      </Field>
      <Field label="Password" error={f.errors.password} htmlFor="password">
        <PasswordInput id="password" autoComplete="current-password" value={f.values.password} onChange={(e) => f.set('password', e.target.value)} invalid={!!f.errors.password} required />
      </Field>
      <div className="flex justify-end">
        <Link href={scope === 'admin' ? '/admin/forgot-password' : '/forgot-password'} className="text-xs text-muted hover:text-fg">Forgot password?</Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={f.loading} variant={scope === 'admin' ? 'light' : 'primary'}>Sign in</Button>
    </form>
  )
}

export function MfaForm({ scope, next }: { scope: Scope; next?: string }) {
  const router = useRouter()
  const f = useForm({ code: '' })
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = await f.submit('/api/auth/mfa', { code: f.values.code, scope })
    if (!res) return
    router.push(next && next.startsWith(home(scope)) ? next : home(scope))
    router.refresh()
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <Field label="Authentication code" error={f.errors.code} htmlFor="code">
        <Input ref={ref} id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" className="num text-center text-2xl tracking-[0.5em]" value={f.values.code} onChange={(e) => f.set('code', e.target.value.replace(/\D/g, ''))} invalid={!!f.errors.code} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={f.loading} disabled={f.values.code.length !== 6}>Verify</Button>
      <p className="text-center text-xs text-faint">
        Lost your device? <Link href={loginPath(scope)} className="text-muted hover:text-fg">Start over</Link> or contact {scope === 'admin' ? 'a super administrator' : 'support'}.
      </p>
    </form>
  )
}

export function RegisterForm() {
  const router = useRouter()
  const f = useForm({ firstName: '', lastName: '', email: '', password: '', accept: false })
  const [done, setDone] = useState(false)
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!f.values.accept) {
      f.setErrors({ accept: 'Please accept the terms to continue' })
      return
    }
     
    const { accept, ...body } = f.values
    const res = await f.submit('/api/auth/register', body)
    if (!res) return
    setDone(true)
    setTimeout(() => {
      router.push('/account')
      router.refresh()
    }, 900)
  }
  if (done) return <Alert tone="gain" icon={<CircleCheck className="size-5" />} title="Account created">Taking you to your dashboard…</Alert>
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" error={f.errors.firstName} htmlFor="fn">
          <Input id="fn" autoComplete="given-name" value={f.values.firstName} onChange={(e) => f.set('firstName', e.target.value)} invalid={!!f.errors.firstName} />
        </Field>
        <Field label="Last name" error={f.errors.lastName} htmlFor="ln">
          <Input id="ln" autoComplete="family-name" value={f.values.lastName} onChange={(e) => f.set('lastName', e.target.value)} invalid={!!f.errors.lastName} />
        </Field>
      </div>
      <Field label="Email" error={f.errors.email} htmlFor="email">
        <Input id="email" type="email" autoComplete="email" value={f.values.email} onChange={(e) => f.set('email', e.target.value)} invalid={!!f.errors.email} />
      </Field>
      <Field label="Password" error={f.errors.password} htmlFor="pw">
        <PasswordInput id="pw" autoComplete="new-password" value={f.values.password} onChange={(e) => f.set('password', e.target.value)} invalid={!!f.errors.password} />
        <PasswordMeter value={f.values.password} />
      </Field>
      <label className="flex items-start gap-3 text-xs leading-relaxed text-muted">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-accent)]" checked={f.values.accept} onChange={(e) => f.set('accept', e.target.checked)} />
        <span>
          I understand that TSLA holdings and orders on this platform are <span className="text-fg">simulated</span>, and I accept the{' '}
          <Link href="/legal/terms" className="underline hover:text-fg">terms</Link> and <Link href="/legal/privacy" className="underline hover:text-fg">privacy policy</Link>.
        </span>
      </label>
      {f.errors.accept && <p className="text-xs text-loss">{f.errors.accept}</p>}
      <Button type="submit" size="lg" className="w-full" loading={f.loading}>Create account</Button>
    </form>
  )
}

export function ForgotForm({ scope }: { scope: Scope }) {
  const f = useForm({ email: '' })
  const [sent, setSent] = useState(false)
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (await f.submit('/api/auth/forgot-password', f.values)) setSent(true)
  }
  if (sent)
    return (
      <Alert tone="gain" icon={<MailCheck className="size-5" />} title="Check your inbox">
        If an account exists for that email, we sent a reset link (valid 30 minutes). In test mode, emails appear in the <Link className="underline" href="/dev/mailbox">test mailbox</Link>.
      </Alert>
    )
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <Field label="Email" error={f.errors.email} htmlFor="email">
        <Input id="email" type="email" autoComplete="email" value={f.values.email} onChange={(e) => f.set('email', e.target.value)} invalid={!!f.errors.email} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={f.loading} variant={scope === 'admin' ? 'light' : 'primary'}>Send reset link</Button>
      <p className="text-center text-xs text-faint"><Link href={loginPath(scope)} className="hover:text-fg">Back to sign in</Link></p>
    </form>
  )
}

export function ResetForm({ scope, token }: { scope: Scope; token: string }) {
  const router = useRouter()
  const f = useForm({ password: '', confirm: '' })
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (f.values.password !== f.values.confirm) return f.setErrors({ confirm: 'Passwords do not match' })
    if (await f.submit('/api/auth/reset-password', { token, password: f.values.password })) router.push(`${loginPath(scope)}?reset=1`)
  }
  if (!token) return <Alert tone="loss">This reset link is missing its token. Request a new one.</Alert>
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <Field label="New password" error={f.errors.password} htmlFor="pw">
        <PasswordInput id="pw" autoComplete="new-password" value={f.values.password} onChange={(e) => f.set('password', e.target.value)} invalid={!!f.errors.password} />
        <PasswordMeter value={f.values.password} />
      </Field>
      <Field label="Confirm password" error={f.errors.confirm} htmlFor="pw2">
        <PasswordInput id="pw2" autoComplete="new-password" value={f.values.confirm} onChange={(e) => f.set('confirm', e.target.value)} invalid={!!f.errors.confirm} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={f.loading}>Set new password</Button>
    </form>
  )
}

export function VerifyEmail({ token }: { token: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>(token ? 'loading' : 'error')
  const [msg, setMsg] = useState(token ? '' : 'The verification link is missing its token.')
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    if (!token) return
    api('/api/auth/verify-email', { body: { token } }).then((r) => {
      setState(r.ok ? 'ok' : 'error')
      if (!r.ok) setMsg(r.error)
    })
  }, [token])
  if (state === 'loading') return <p className="text-sm text-muted">Verifying your email…</p>
  if (state === 'ok')
    return (
      <div className="space-y-4">
        <Alert tone="gain" icon={<CircleCheck className="size-5" />} title="Email verified">You can now add funds and start identity verification.</Alert>
        <Link href="/account" className="block text-center text-sm text-fg underline">Go to dashboard</Link>
      </div>
    )
  return (
    <div className="space-y-4">
      <Alert tone="loss" title="Verification failed">{msg}</Alert>
      <Link href="/account" className="block text-center text-sm text-muted underline">Sign in to request a new link</Link>
    </div>
  )
}

export function AdminSetupForm() {
  const router = useRouter()
  const f = useForm({ setupToken: '', firstName: '', lastName: '', email: '', password: '' })
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (await f.submit('/api/admin/setup', f.values)) {
      router.push('/admin/security?welcome=1')
      router.refresh()
    }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <Field label="Setup token" error={f.errors.setupToken} hint="The ADMIN_SETUP_TOKEN value from the server environment." htmlFor="tok">
        <PasswordInput id="tok" autoComplete="off" value={f.values.setupToken} onChange={(e) => f.set('setupToken', e.target.value)} invalid={!!f.errors.setupToken} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" error={f.errors.firstName} htmlFor="fn"><Input id="fn" value={f.values.firstName} onChange={(e) => f.set('firstName', e.target.value)} /></Field>
        <Field label="Last name" error={f.errors.lastName} htmlFor="ln"><Input id="ln" value={f.values.lastName} onChange={(e) => f.set('lastName', e.target.value)} /></Field>
      </div>
      <Field label="Admin email" error={f.errors.email} htmlFor="em"><Input id="em" type="email" autoComplete="username" value={f.values.email} onChange={(e) => f.set('email', e.target.value)} invalid={!!f.errors.email} /></Field>
      <Field label="Password" error={f.errors.password} htmlFor="pw">
        <PasswordInput id="pw" autoComplete="new-password" value={f.values.password} onChange={(e) => f.set('password', e.target.value)} invalid={!!f.errors.password} />
        <PasswordMeter value={f.values.password} />
      </Field>
      <Button type="submit" size="lg" variant="light" className="w-full" loading={f.loading}>Create super administrator</Button>
    </form>
  )
}
