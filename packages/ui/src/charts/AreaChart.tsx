'use client';
import { useId, useMemo, useRef, useState } from 'react';

export interface Point {
  t: string;
  v: number;
}

/**
 * Single-series area/line chart with crosshair + tooltip hover, keyboard access (←/→) and a
 * screen-reader table. Single series → no legend; the card title names it.
 */
export function AreaChart({
  data, height = 240, format = (v) => v.toFixed(2), formatTime = (t) => new Date(t).toLocaleString(), tone = 'accent', label,
}: {
  data: Point[]; height?: number; format?: (v: number) => string; formatTime?: (t: string) => string; tone?: 'accent' | 'pos' | 'neg'; label: string;
}) {
  const id = useId().replace(/:/g, '');
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = height;
  const pad = { t: 12, r: 8, b: 24, l: 8 };
  const { path, area, xs, ys, min, max } = useMemo(() => {
    if (data.length < 2) return { path: '', area: '', xs: [] as number[], ys: [] as number[], min: 0, max: 0 };
    const vals = data.map((d) => d.v);
    let mn = Math.min(...vals);
    let mx = Math.max(...vals);
    if (mn === mx) { mn -= 1; mx += 1; }
    const span = mx - mn;
    mn -= span * 0.08; mx += span * 0.08;
    const x = (i: number) => pad.l + (i / (data.length - 1)) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - mn) / (mx - mn)) * (H - pad.t - pad.b);
    const xs = data.map((_, i) => x(i));
    const ys = data.map((d) => y(d.v));
    const p = xs.map((xx, i) => `${i ? 'L' : 'M'}${xx.toFixed(1)},${ys[i]!.toFixed(1)}`).join('');
    return { path: p, area: `${p}L${xs[xs.length - 1]!.toFixed(1)},${H - pad.b}L${xs[0]!.toFixed(1)},${H - pad.b}Z`, xs, ys, min: mn, max: mx };
  }, [data, H]);

  if (data.length < 2) {
    return <div className="flex items-center justify-center text-[13px] text-muted" style={{ height }}>Not enough data yet</div>;
  }
  const color = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--accent)';
  const onMove = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const rel = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i]! - rel) < Math.abs(xs[best]! - rel)) best = i;
    setHover(best);
  };
  const h = hover !== null ? data[hover] : null;
  const gridYs = [0.25, 0.5, 0.75].map((f) => pad.t + f * (H - pad.t - pad.b));
  return (
    <div className="relative" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full touch-none select-none outline-none" style={{ height }}
        role="img" aria-label={`${label}: from ${format(data[0]!.v)} to ${format(data[data.length - 1]!.v)}. Range ${format(min)} to ${format(max)}. Use arrow keys to inspect values.`}
        tabIndex={0}
        onPointerMove={(e) => onMove(e.clientX)} onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setHover((v) => Math.min(data.length - 1, (v ?? -1) + 1));
          if (e.key === 'ArrowLeft') setHover((v) => Math.max(0, (v ?? data.length) - 1));
          if (e.key === 'Escape') setHover(null);
        }}>
        <defs>
          <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridYs.map((gy) => <line key={gy} x1={0} x2={W} y1={gy} y2={gy} stroke="var(--border)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />)}
        <line x1={0} x2={W} y1={H - pad.b} y2={H - pad.b} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
        <path d={area} fill={`url(#g${id})`} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hover !== null ? (
          <>
            <line x1={xs[hover]} x2={xs[hover]} y1={pad.t} y2={H - pad.b} stroke="var(--border-strong)" vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
      </svg>
      {hover !== null ? (
        <span aria-hidden="true" className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{ left: `${(xs[hover]! / W) * 100}%`, top: ys[hover], background: color, borderColor: 'var(--surface)' }} />
      ) : null}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex justify-between px-1 text-[11px] text-faint" aria-hidden="true">
        <span>{formatTime(data[0]!.t)}</span>
        <span>{formatTime(data[data.length - 1]!.t)}</span>
      </div>
      {h ? (
        <div role="status" className="pointer-events-none absolute top-1 z-10 rounded-lg border border-border bg-surface px-3 py-2 text-[12px] shadow-pop"
          style={{ left: `clamp(0px, calc(${(xs[hover!]! / W) * 100}% - 70px), calc(100% - 150px))` }}>
          <div className="text-muted">{formatTime(h.t)}</div>
          <div className="num mt-0.5 text-[13px] font-medium text-text">{format(h.v)}</div>
        </div>
      ) : null}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th>Time</th><th>Value</th></tr></thead>
        <tbody>{data.filter((_, i) => i % Math.ceil(data.length / 24) === 0).map((d) => <tr key={d.t}><td>{formatTime(d.t)}</td><td>{format(d.v)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
