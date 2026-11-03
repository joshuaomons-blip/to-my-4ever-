import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn, relTime } from '@/lib/format'

// ─── Buttons ───────────────────────────────────────────────
// primary = brand red (one main action per view) · light = solid charcoal (secondary emphasis)
// ghost = outlined · subtle = tinted · danger/success = review decisions

type Variant = 'primary' | 'light' | 'ghost' | 'subtle' | 'danger' | 'success'
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-[color-mix(in_srgb,var(--color-accent)_88%,black)] shadow-[0_1px_0_rgb(0_0_0/0.08)]',
  light: 'bg-fg text-white hover:bg-fg-1',
  ghost: 'border border-hairline bg-surface text-fg-1 hover:border-fg/25 hover:bg-surface-3',
  subtle: 'bg-surface-3 text-fg-1 hover:bg-canvas-2',
  danger: 'border border-loss/30 bg-surface text-loss hover:bg-loss/[0.06]',
  success: 'border border-gain/30 bg-surface text-gain hover:bg-gain/[0.06]',
}
const sizes = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-5 text-[15px] gap-2' }

export function buttonClass(variant: Variant = 'primary', size: keyof typeof sizes = 'md', extra?: string) {
  return cn(
    'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40',
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
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4 sm:px-6', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-hairline pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1.5 text-[13px] font-medium text-muted">{eyebrow}</p>}
        <h1 className="display text-[28px] leading-tight font-semibold text-fg sm:text-[32px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>}
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
    <Card className={cn('p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {icon && <span className="text-faint">{icon}</span>}
      </div>
      <p className="num mt-2 text-[24px] leading-tight font-semibold text-fg">{value}</p>
      {sub && <p className={cn('num mt-1 text-[13px]', tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : 'text-muted')}>{sub}</p>}
    </Card>
  )
}

// ─── Badges ────────────────────────────────────────────────

const badgeTones = {
  neutral: 'bg-surface-3 text-fg-2 border-hairline',
  gain: 'bg-gain/[0.07] text-gain border-gain/20',
  loss: 'bg-loss/[0.07] text-loss border-loss/20',
  warn: 'bg-warn/[0.08] text-warn border-warn/25',
  accent: 'bg-accent/[0.07] text-accent border-accent/25',
  info: 'bg-info/[0.07] text-info border-info/20',
}
export type BadgeTone = keyof typeof badgeTones

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: BadgeTone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap', badgeTones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

const STATUS: Record<string, [BadgeTone, string]> = {
  COMPLETED: ['gain', 'Completed'],
  APPROVED: ['gain', 'Approved'],
  ACTIVE: ['gain', 'Active'],
  SUCCEEDED: ['gain', 'Received'],
  APPLIED: ['gain', 'Applied'],
  ANSWERED: ['info', 'Answered'],
  OPEN: ['warn', 'Open'],
  PENDING: ['warn', 'Pending'],
  PENDING_APPROVAL: ['warn', 'Awaiting approval'],
  AWAITING_PAYMENT: ['warn', 'Awaiting payment'],
  PROCESSING: ['info', 'Processing'],
  REJECTED: ['loss', 'Rejected'],
  SUSPENDED: ['loss', 'Suspended'],
  FAILED: ['loss', 'Failed'],
  EXPIRED: ['neutral', 'Expired'],
  CANCELLED: ['neutral', 'Cancelled'],
  CLOSED: ['neutral', 'Closed'],
  NOT_STARTED: ['neutral', 'Not started'],
}
export function StatusBadge({ status }: { status: string }) {
  const [tone, label] = STATUS[status] ?? ['neutral', status.replace(/_/g, ' ').toLowerCase()]
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  )
}

/** Marks values that are simulated / test-mode. */
export function SimBadge({ className, children = 'Simulated' }: { className?: string; children?: ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-sm bg-surface-3 px-1.5 py-px text-[11px] font-medium text-muted ring-1 ring-hairline ring-inset', className)}>{children}</span>
}

// ─── Form fields ───────────────────────────────────────────

export const inputClass =
  'w-full rounded-md border border-hairline bg-surface px-3 py-2.5 text-[15px] text-fg placeholder:text-faint shadow-[inset_0_1px_1px_rgb(0_0_0/0.03)] transition-colors hover:border-fg/20 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:bg-surface-3 disabled:text-muted aria-[invalid=true]:border-loss'

export function Field({ label, error, hint, children, htmlFor, className }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-fg-1">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[13px] text-loss" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export function Input({ className, invalid, ...props }: ComponentProps<'input'> & { invalid?: boolean }) {
  return <input className={cn(inputClass, className)} aria-invalid={invalid || undefined} {...props} />
}
export function Select({ className, invalid, ...props }: ComponentProps<'select'> & { invalid?: boolean }) {
  return <select className={cn(inputClass, 'pr-8', className)} aria-invalid={invalid || undefined} {...props} />
}
export function Textarea({ className, invalid, ...props }: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return <textarea className={cn(inputClass, 'min-h-24 resize-y', className)} aria-invalid={invalid || undefined} {...props} />
}

export function Alert({ tone = 'neutral', title, children, icon, className }: { tone?: BadgeTone; title?: ReactNode; children?: ReactNode; icon?: ReactNode; className?: string }) {
  const tones: Record<BadgeTone, string> = {
    neutral: 'border-hairline bg-surface-2 text-fg-1',
    gain: 'border-gain/25 bg-gain/[0.05] text-gain',
    loss: 'border-loss/25 bg-loss/[0.05] text-loss',
    warn: 'border-warn/30 bg-warn/[0.06] text-warn',
    accent: 'border-accent/25 bg-accent/[0.04] text-accent',
    info: 'border-info/20 bg-info/[0.05] text-info',
  }
  return (
    <div className={cn('flex gap-3 rounded-md border px-4 py-3 text-sm', tones[tone], className)} role={tone === 'loss' ? 'alert' : 'status'}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn('text-[14px] leading-relaxed', title ? 'mt-0.5 text-fg-2' : '')}>{children}</div>}
      </div>
    </div>
  )
}

// ─── States ────────────────────────────────────────────────

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <p className="text-[15px] font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-surface-3', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.7),transparent)]" />
    </div>
  )
}

export function Pagination({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (p: number) => string }) {
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3 text-[13px] text-muted">
      <span>
        Page <span className="num text-fg">{page}</span> of <span className="num text-fg">{pages}</span>
      </span>
      <div className="flex gap-2">
        {page > 1 ? <ButtonLink href={hrefFor(page - 1)} variant="ghost" size="sm">Previous</ButtonLink> : <span className={buttonClass('ghost', 'sm', 'opacity-40')}>Previous</span>}
        {page < pages ? <ButtonLink href={hrefFor(page + 1)} variant="ghost" size="sm">Next</ButtonLink> : <span className={buttonClass('ghost', 'sm', 'opacity-40')}>Next</span>}
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
export const th = 'bg-surface-2 px-5 py-2.5 text-[12.5px] font-medium text-muted whitespace-nowrap'
export const td = 'px-5 py-3 whitespace-nowrap'

/** Relative time ("5m ago"). The label can legitimately differ between server and browser render. */
export function RelTime({ date }: { date: string | Date }) {
  return (
    <time dateTime={new Date(date).toISOString()} suppressHydrationWarning>
      {relTime(date)}
    </time>
  )
}
