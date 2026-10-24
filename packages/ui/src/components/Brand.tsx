'use client';
import { useEffect, useState } from 'react';
import { cn } from '../cn';
import { Icon } from './icons';

/** Placeholder brand. Change BRAND_NAME (and the mark) when the company name is decided. */
export const BRAND_NAME = 'Aureon Capital';

export function Logo({ className, suffix }: { className?: string; suffix?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--ink)" />
        <path d="M9 23L16 8l7 15M11.8 17.5h8.4" stroke="var(--accent)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="display text-[19px] font-medium leading-none text-text">
        Aureon<span className="text-muted"> {suffix ?? 'Capital'}</span>
      </span>
    </span>
  );
}

type Theme = 'system' | 'light' | 'dark';

function applyTheme(t: Theme) {
  const el = document.documentElement;
  if (t === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', t);
}

/** Inline script for <head> to apply the stored theme before paint (prevents a flash). */
export const themeInitScript = `try{var t=localStorage.getItem('aur-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    try {
      const t = localStorage.getItem('aur-theme');
      if (t === 'light' || t === 'dark') setTheme(t);
    } catch { /* storage unavailable */ }
  }, []);
  const choose = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
    try {
      if (t === 'system') localStorage.removeItem('aur-theme');
      else localStorage.setItem('aur-theme', t);
    } catch { /* ignore */ }
  };
  const opts: Array<{ v: Theme; icon: 'monitor' | 'sun' | 'moon'; label: string }> = [
    { v: 'system', icon: 'monitor', label: 'System theme' },
    { v: 'light', icon: 'sun', label: 'Light theme' },
    { v: 'dark', icon: 'moon', label: 'Dark theme' },
  ];
  return (
    <div role="radiogroup" aria-label="Colour theme" className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
      {opts.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={theme === o.v} aria-label={o.label} title={o.label} onClick={() => choose(o.v)}
          className={cn('rounded-md transition-colors', compact ? 'p-1' : 'p-1.5', theme === o.v ? 'bg-surface text-text shadow-sm' : 'text-faint hover:text-text')}>
          <Icon name={o.icon} size={compact ? 14 : 15} />
        </button>
      ))}
    </div>
  );
}

/** Persistent, non-dismissable operating-mode notice. Never hide this in sandbox. */
export function ModeBanner({ mode }: { mode: 'sandbox' | 'live' | string | undefined }) {
  if (mode === 'live') return null;
  return (
    <div className="border-b border-warn/25 bg-warn-soft text-warn">
      <p className="mx-auto flex max-w-[1400px] items-center justify-center gap-2 px-4 py-1.5 text-center text-[12.5px] font-medium">
        <Icon name="alert" size={14} />
        Sandbox environment — simulated brokerage partner, payments and prices. No real money or securities. {BRAND_NAME} is not currently authorised to provide investment services.
      </p>
    </div>
  );
}
