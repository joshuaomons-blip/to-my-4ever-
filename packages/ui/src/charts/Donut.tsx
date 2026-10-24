'use client';
import { useState } from 'react';
import { cn } from '../cn';

export interface Slice {
  key: string;
  label: string;
  value: number;
}

/** Fixed categorical order; anything beyond 5 slices folds into "Other" (never a generated 7th hue). */
export const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];

export function foldSlices(slices: Slice[], max = 6): Slice[] {
  const sorted = [...slices].sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1).reduce((s, x) => s + x.value, 0);
  return [...head, { key: '__other', label: 'Other', value: rest }];
}

/**
 * Allocation donut with a labelled legend (label + %) — identity never relies on colour alone,
 * and the light-mode contrast warning on some hues is relieved by the visible labels.
 */
export function Donut({ slices, size = 168, centerLabel, centerValue, format = (v) => v.toFixed(2) }: {
  slices: Slice[]; size?: number; centerLabel?: string; centerValue?: string; format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const data = foldSlices(slices.filter((s) => s.value > 0));
  const total = data.reduce((s, x) => s + x.value, 0);
  const r = 46;
  const C = 2 * Math.PI * r;
  const gap = data.length > 1 ? 1.2 : 0; // surface gap between segments (in circumference units)
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`Allocation: ${data.map((d) => `${d.label} ${((d.value / total) * 100).toFixed(1)}%`).join(', ')}`}>
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
          {total > 0 && data.map((d, i) => {
            const len = (d.value / total) * C;
            const dash = Math.max(0, len - gap);
            const el = (
              <circle key={d.key} cx="60" cy="60" r={r} fill="none" stroke={SERIES[i]} strokeWidth={hover === d.key ? 16 : 14}
                strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)"
                onPointerEnter={() => setHover(d.key)} onPointerLeave={() => setHover(null)} className="transition-[stroke-width] duration-150">
                <title>{`${d.label}: ${((d.value / total) * 100).toFixed(1)}% (${format(d.value)})`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerLabel ? <span className="text-[11px] text-muted">{centerLabel}</span> : null}
          {centerValue ? <span className="num text-[15px] font-medium text-text">{centerValue}</span> : null}
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5 text-[13px]">
        {data.map((d, i) => (
          <li key={d.key} onPointerEnter={() => setHover(d.key)} onPointerLeave={() => setHover(null)}
            className={cn('flex items-center justify-between gap-3 rounded-md px-1.5 py-1', hover === d.key && 'bg-surface-2')}>
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SERIES[i] }} aria-hidden="true" />
              <span className="truncate text-text">{d.label}</span>
            </span>
            <span className="num shrink-0 text-muted">{((d.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
