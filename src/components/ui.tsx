import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/format'

// ─── Buttons ───────────────────────────────────────────────

type Variant = 'primary' | 'light' | 'ghost' | 'subtle' | 'danger' | 'success'
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:brightness-110 shadow-[0_10px_30px_-12px_var(--color-accent)]',
  light: 'bg-white text-ink hover:bg-silver-2',
  ghost: 'border border-white/10 text-silver hover:border-white/25 hover:bg-white/[0.04] hover:text-white',
  subtle: 'bg-white/[0.05] text-silver hover:bg-white/[0.09] hover:text-white',
  danger: 'bg-loss/15 text-loss border border-loss/25 hover:bg-loss/25',
  success: 'bg-gain/15 text-gain border border-gain/25 hover:bg-gain/25',
}
const sizes = { sm: 'h-8 px-3 text-xs gap-1.5', md: 'h-10 px-4.5 text-sm gap-2', lg: 'h-12 px-6 text-[15px] gap-2' }

export function buttonClass(variant: Variant = 'primary', size: keyof typeof sizes = 'md', extra?: string) {
  return cn(
    'inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
    variants[variant],
    sizes[size],
    extra,
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: keyof typeof sizes; loading?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={loading || props.disabled} {...props}>
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />
}

// ─── Surfaces ──────────────────────────────────────────────

export function Card({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('card', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6', className)}>
      <div className="min-w-0">
        <h2 className="font-display text-[15px] font-medium tracking-tight text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-mute">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="animate-fade-up">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.03em] text-white sm:text-[34px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mute">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Stat({
  label,
  value,
  sub,
  tone,
  icon,
  className,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'gain' | 'loss' | 'neutral'
  icon?: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('p-5 sm:p-6', className)}>
      <div className="flex items-center justify-between">
        <p className="eyebrow">{label}</p>
        {icon && <span className="text-dim">{icon}</span>}
      </div>
      <p className="num mt-3 text-[22px] font-medium text-white sm:text-[26px]">{value}</p>
      {sub && <p className={cn('num mt-1.5 text-xs', tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : 'text-mute')}>{sub}</p>}
    </Card>
  )
}

// ─── Badges ────────────────────────────────────────────────

const badgeTones = {
  neutral: 'bg-white/[0.06] text-silver border-white/10',
  gain: 'bg-gain/10 text-gain border-gain/20',
  loss: 'bg-loss/10 text-loss border-loss/20',
  warn: 'bg-warn/10 text-warn border-warn/20',
  accent: 'bg-accent/10 text-accent border-accent/25',
  info: 'bg-sky-400/10 text-sky-300 border-sky-400/20',
}
export type BadgeTone = keyof typeof badgeTones

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: BadgeTone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap', badgeTones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

const STATUS_TONE: Record<string, BadgeTone> = {
  COMPLETED: 'gain', APPROVED: 'gain', ACTIVE: 'gain',
  PENDING: 'warn',
  REJECTED: 'loss', SUSPENDED: 'loss', CANCELLED: 'neutral',
  NOT_STARTED: 'neutral',
}
export function StatusBadge({ status }: { status: string }) {
  const label = status.replace('_', ' ').toLowerCase()
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot>
      <span className="capitalize">{label}</span>
    </Badge>
  )
}

export function SimBadge({ className, children = 'Simulated' }: { className?: string; children?: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-accent', className)}>
      <span className="size-1 rounded-full bg-accent animate-pulse-soft" />
      {children}
    </span>
  )
}

// ─── Form fields ───────────────────────────────────────────

export const inputClass =
  'w-full rounded-xl border border-white/10 bg-ink/70 px-3.5 py-2.5 text-sm text-white placeholder:text-dim transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50 aria-[invalid=true]:border-loss/60'

export function Field({ label, error, hint, children, htmlFor, className }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-silver">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-xs text-loss" role="alert">{error}</p> : hint ? <p className="mt-1.5 text-xs text-dim">{hint}</p> : null}
    </div>
  )
}

export function Input({ className, invalid, ...props }: ComponentProps<'input'> & { invalid?: boolean }) {
  return <input className={cn(inputClass, className)} aria-invalid={invalid || undefined} {...props} />
}
export function Select({ className, invalid, ...props }: ComponentProps<'select'> & { invalid?: boolean }) {
  return <select className={cn(inputClass, 'appearance-none pr-8', className)} aria-invalid={invalid || undefined} {...props} />
}
export function Textarea({ className, invalid, ...props }: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return <textarea className={cn(inputClass, 'min-h-24 resize-y', className)} aria-invalid={invalid || undefined} {...props} />
}

export function Alert({ tone = 'neutral', title, children, icon, className }: { tone?: BadgeTone; title?: ReactNode; children?: ReactNode; icon?: ReactNode; className?: string }) {
  const tones: Record<BadgeTone, string> = {
    neutral: 'border-white/10 bg-white/[0.03] text-silver',
    gain: 'border-gain/20 bg-gain/[0.06] text-gain',
    loss: 'border-loss/25 bg-loss/[0.07] text-loss',
    warn: 'border-warn/25 bg-warn/[0.07] text-warn',
    accent: 'border-accent/25 bg-accent/[0.07] text-accent',
    info: 'border-sky-400/20 bg-sky-400/[0.06] text-sky-300',
  }
  return (
    <div className={cn('flex gap-3 rounded-2xl border px-4 py-3.5 text-sm', tones[tone], className)} role={tone === 'loss' ? 'alert' : 'status'}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn('text-[13px] leading-relaxed', title ? 'mt-0.5 text-silver/80' : '')}>{children}</div>}
      </div>
    </div>
  )
}

// ─── States ────────────────────────────────────────────────

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-mute">{icon}</div>}
      <p className="font-display text-[15px] font-medium text-white">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-mute">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-white/[0.04]', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
    </div>
  )
}

export function Pagination({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (p: number) => string }) {
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-3.5 text-xs text-mute">
      <span>
        Page <span className="num text-silver">{page}</span> of <span className="num text-silver">{pages}</span>
      </span>
      <div className="flex gap-2">
        {page > 1 ? <ButtonLink href={hrefFor(page - 1)} variant="ghost" size="sm">Previous</ButtonLink> : <span className={buttonClass('ghost', 'sm', 'opacity-30')}>Previous</span>}
        {page < pages ? <ButtonLink href={hrefFor(page + 1)} variant="ghost" size="sm">Next</ButtonLink> : <span className={buttonClass('ghost', 'sm', 'opacity-30')}>Next</span>}
      </div>
    </div>
  )
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  )
}
export const th = 'px-5 py-3 text-[10.5px] font-medium uppercase tracking-[0.14em] text-dim whitespace-nowrap'
export const td = 'px-5 py-3.5 whitespace-nowrap'
