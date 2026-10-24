'use client';
import { Badge, Card, EmptyState, Icon, Input, Segmented, Skeleton, Table, formatMoney, formatPct, toneOf } from '@aureon/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Freshness } from '@/components/Freshness';
import { LoadError } from '@/components/LoadError';
import { PageHeader } from '@/components/PageHeader';
import { useApi } from '@/lib/hooks';
import type { Instrument, Quote } from '@/lib/types';

function Markets() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(q);
  const [cls, setCls] = useState<'all' | 'equity' | 'etf'>('all');
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 200); return () => clearTimeout(t); }, [q]);
  const { data: list, loading, error } = useApi<Instrument[]>(`/v1/instruments?q=${encodeURIComponent(debounced)}${cls !== 'all' ? `&assetClass=${cls}` : ''}`);
  const symbols = list?.map((i) => i.symbol).slice(0, 50) ?? [];
  const { data: quotes } = useApi<Quote[]>(symbols.length ? `/v1/quotes?symbols=${symbols.join(',')}` : null, { refreshMs: 15_000 });
  const asOf = quotes?.[0];
  return (
    <>
      <PageHeader title="Markets" description="US-listed stocks and ETFs available through our brokerage partner." actions={asOf ? <Freshness q={asOf} /> : null} />
      <Card>
        <LoadError error={error} />
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-sm">
            <span className="sr-only">Search by symbol or name</span>
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Symbol or company name" className="pl-9" autoFocus />
          </label>
          <Segmented label="Asset class" value={cls} onChange={setCls} options={[{ value: 'all', label: 'All' }, { value: 'equity', label: 'Stocks' }, { value: 'etf', label: 'ETFs' }]} />
        </div>
        {loading && !list ? <div className="space-y-3 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div> : list?.length ? (
          <Table>
            <thead><tr><th>Asset</th><th className="hidden md:table-cell">Sector</th><th className="!text-right">Last</th><th className="!text-right">Change</th><th className="hidden !text-right sm:table-cell">Bid / Ask</th></tr></thead>
            <tbody>
              {list.map((i) => {
                const qt = quotes?.find((x) => x.symbol === i.symbol);
                const chg = qt ? ((Number(qt.last) - Number(qt.previousClose)) / Number(qt.previousClose)) * 100 : null;
                return (
                  <tr key={i.id} className="cursor-pointer hover:bg-surface-2/50">
                    <td>
                      <Link href={`/app/markets/${i.symbol}`} className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[11px] font-bold tracking-tight text-muted">{i.symbol.slice(0, 4)}</span>
                        <span className="min-w-0"><span className="flex items-center gap-2 font-semibold">{i.symbol}{i.assetClass === 'etf' ? <Badge tone="info">ETF</Badge> : null}</span><span className="block max-w-[260px] truncate text-[12.5px] text-muted">{i.name}</span></span>
                      </Link>
                    </td>
                    <td className="hidden text-muted md:table-cell">{i.sector}</td>
                    <td className="num text-right">{qt ? formatMoney(qt.last) : '—'}</td>
                    <td className={`num text-right ${toneOf(chg) === 'pos' ? 'text-pos' : toneOf(chg) === 'neg' ? 'text-neg' : 'text-muted'}`}>{chg === null ? '—' : formatPct(chg)}</td>
                    <td className="num hidden text-right text-muted sm:table-cell">{qt ? `${qt.bid} / ${qt.ask}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : <EmptyState title="No matches" description="Try a different symbol or name." />}
      </Card>
    </>
  );
}

export default function MarketsPage() {
  return <Suspense><Markets /></Suspense>;
}
