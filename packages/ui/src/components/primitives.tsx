import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../cn';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'positive';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-ink text-ink-contrast hover:opacity-90 shadow-sm',
  accent: 'bg-accent text-white hover:bg-accent-strong shadow-sm dark:text-[#0a0d12]',
  secondary: 'bg-surface text-text border border-border-strong hover:bg-surface-2',
  ghost: 'text-muted hover:text-text hover:bg-surface-2',
  danger: 'bg-neg text-white hover:opacity-90',
  positive: 'bg-pos text-white hover:opacity-90',
};
const SIZE: Record<Size, string> = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-6 text-[15px] gap-2' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', loading, block, className, children, disabled, ...rest }, ref) {
  return (
    <button ref={ref} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cn('inline-flex select-none items-center justify-center rounded-lg font-medium transition-[background,opacity,color] duration-150 disabled:cursor-not-allowed disabled:opacity-50', VARIANT[variant], SIZE[size], block && 'w-full', className)}
      {...rest}>
      {loading ? <Spinner size={14} /> : null}
      {children}
    </button>
  );
});

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface shadow-card', className)} {...rest} />;
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-text">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...rest} />;
}

export type Tone = 'neutral' | 'positive' | 'negative' | 'warning' | 'info' | 'accent';
const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted border-border',
  positive: 'bg-pos-soft text-pos border-transparent',
  negative: 'bg-neg-soft text-neg border-transparent',
  warning: 'bg-warn-soft text-warn border-transparent',
  info: 'bg-info-soft text-info border-transparent',
  accent: 'bg-accent-soft text-accent-strong border-transparent',
};

export function Badge({ tone = 'neutral', className, children, dot }: { tone?: Tone; className?: string; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium', TONE[tone], className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function Field({ label, hint, error, htmlFor, children, optional }: { label: string; hint?: ReactNode; error?: string | null; htmlFor: string; children: ReactNode; optional?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline justify-between text-[13px] font-medium text-text">
        <span>{label}</span>
        {optional ? <span className="text-[12px] font-normal text-faint">Optional</span> : null}
      </label>
      {children}
      {error ? <p id={`${htmlFor}-error`} role="alert" className="text-[12.5px] text-neg">{error}</p> : hint ? <p id={`${htmlFor}-hint`} className="text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

const control = 'w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60 aria-[invalid=true]:border-neg';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, 'h-10', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(control, 'h-10 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238e9299' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-28 py-2.5', className)} {...rest} />;
});

export function Checkbox({ id, label, description, ...rest }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: ReactNode; description?: ReactNode }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-lg p-1">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-[var(--accent)]" {...rest} />
      <span className="text-sm leading-snug">
        <span className="text-text">{label}</span>
        {description ? <span className="mt-0.5 block text-[13px] text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function Alert({ tone = 'info', title, children, className }: { tone?: Exclude<Tone, 'neutral' | 'accent'> | 'neutral'; title?: ReactNode; children?: ReactNode; className?: string }) {
  const map = { info: 'border-info/25 bg-info-soft text-info', positive: 'border-pos/25 bg-pos-soft text-pos', negative: 'border-neg/25 bg-neg-soft text-neg', warning: 'border-warn/25 bg-warn-soft text-warn', neutral: 'border-border bg-surface-2 text-muted' } as const;
  return (
    <div role={tone === 'negative' ? 'alert' : 'status'} className={cn('rounded-lg border px-4 py-3 text-[13.5px]', map[tone], className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title ? 'mt-0.5' : '', 'text-text/80 [&_a]:underline')}>{children}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-surface-3/70', className)} />;
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 h-10 w-10 rounded-full border border-dashed border-border-strong" aria-hidden="true" />
      <p className="text-sm font-medium text-text">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, sub, tone, hint }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'pos' | 'neg' | 'flat'; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[12.5px] font-medium text-muted" title={hint}>{label}</p>
      <p className="num mt-1 truncate text-[22px] font-medium text-text">{value}</p>
      {sub ? <p className={cn('num mt-0.5 text-[12.5px]', tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : 'text-muted')}>{sub}</p> : null}
    </div>
  );
}

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="-mx-px overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm [&_td]:border-t [&_td]:border-border [&_td]:px-5 [&_td]:py-3 [&_th]:px-5 [&_th]:pb-2.5 [&_th]:pt-3 [&_th]:text-left [&_th]:text-[11.5px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-[0.06em] [&_th]:text-faint', className)} {...rest} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, size = 'md' }: { value: T; options: Array<{ value: T; label: ReactNode }>; onChange: (v: T) => void; label: string; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button key={o.value} role="tab" type="button" aria-selected={o.value === value} onClick={() => onChange(o.value)}
          className={cn('rounded-md font-medium transition-colors', size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]',
            o.value === value ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ items, className }: { items: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={cn('divide-y divide-border text-sm', className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right text-text">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
