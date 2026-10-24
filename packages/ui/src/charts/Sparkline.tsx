/** Tiny trend line for table cells. Decorative; the adjacent cell carries the number. */
export function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="inline-block" style={{ width, height }} />;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const span = mx - mn || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - mn) / span) * (height - 4)).toFixed(1)}`).join(' ');
  const up = values[values.length - 1]! >= values[0]!;
  return (
    <svg width={width} height={height} aria-hidden="true" className="inline-block align-middle">
      <polyline points={pts} fill="none" stroke={up ? 'var(--pos)' : 'var(--neg)'} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
