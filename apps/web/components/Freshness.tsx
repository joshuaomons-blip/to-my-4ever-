import { Badge, formatDateTime, relativeTime } from '@aureon/ui';
import type { Quote } from '@/lib/types';

/** Every price shown carries its source timestamp and simulated/stale status. */
export function Freshness({ q }: { q: Pick<Quote, 'asOf' | 'source' | 'stale' | 'simulated' | 'delayed'> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-[11.5px] text-faint" title={`${q.source} · ${formatDateTime(q.asOf, true)}`}>
      <time dateTime={q.asOf}>As of {relativeTime(q.asOf)}</time>
      {q.stale ? <Badge tone="negative">Stale</Badge> : null}
      {q.simulated ? <Badge tone="warning">Simulated</Badge> : q.delayed ? <Badge>Delayed</Badge> : null}
    </span>
  );
}
