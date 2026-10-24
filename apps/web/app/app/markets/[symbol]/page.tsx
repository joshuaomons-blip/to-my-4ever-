'use client';
import { AreaChart, Badge, Button, Card, CardBody, CardHeader, Icon, KeyValue, Segmented, Skeleton, formatDate, formatMoney, formatNumber, formatPct, toneOf } from '@aureon/ui';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Freshness } from '@/components/Freshness';
import { OrderTicket } from '@/components/OrderTicket';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { Instrument, Portfolio, Quote } from '@/lib/types';

type Range = '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y';

export default function AssetPage() {
  const symbol = String(useParams().symbol).toUpperCase();
  const [range, setRange] = useState<Range>('3M');
  const { data: inst } = useApi<Instrument & { corporateActions: Array<{ type: string; exDate: string; payDate: string }> }>(`/v1/instruments/${symbol}`);
  const { data: q } = useApi<Quote>(`/v1/quotes/${symbol}`, { refreshMs: 5_000 });
  const { data: bars } = useApi<{ bars: Array<{ t: string; c: string }>; simulated: boolean }>(`/v1/bars/${symbol}?range=${range}`);
  const { data: p, reload } = useApi<Portfolio>('/v1/portfolio');
  const { data: lists, reload: reloadLists } = useApi<Array<{ id: string; items: Array<{ symbol: string }> }>>('/v1/watchlists');
  const holding = p?.holdings.find((h) => h.symbol === symbol);
  const watched = lists?.[0]?.items.some((i) => i.symbol === symbol);
  const chg = q ? Number(q.last) - Number(q.previousClose) : 0;
  const pts = (bars?.bars ?? []).map((b) => ({ t: b.t, v: Number(b.c) }));
  const rangeUp = pts.length > 1 ? pts[pts.length - 1]!.v >= pts[0]!.v : true;
  const active = p?.account?.status === 'active';

  const toggleWatch = async () => {
    const id = lists?.[0]?.id;
    if (!id) return;
    if (watched) await api(`/v1/watchlists/${id}/items/${symbol}`, { method: 'DELETE' });
    else await api(`/v1/watchlists/${id}/items`, { body: { symbol } });
    reloadLists();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-muted">{symbol}</span>
              {inst ? <><Badge>{inst.exchange}</Badge>{inst.assetClass === 'etf' ? <Badge tone="info">ETF</Badge> : null}</> : null}
            </div>
            <h1 className="display mt-1 text-[30px] font-medium leading-tight">{inst?.name ?? <Skeleton className="h-8 w-64" />}</h1>
            <div className="mt-3 flex flex-wrap items-baseline gap-3">
              <span className="num text-[34px] font-medium">{q ? formatMoney(q.last) : '—'}</span>
              {q ? <span className={`num text-[15px] ${toneOf(chg) === 'pos' ? 'text-pos' : toneOf(chg) === 'neg' ? 'text-neg' : 'text-muted'}`}>{formatMoney(chg, 'USD', { sign: true })} ({formatPct((chg / Number(q.previousClose)) * 100)}) today</span> : null}
            </div>
            {q ? <div className="mt-1"><Freshness q={q} /></div> : null}
          </div>
          <Button variant="secondary" onClick={toggleWatch} aria-pressed={!!watched}>
            <Icon name="star" size={16} className={watched ? 'fill-accent text-accent' : ''} />{watched ? 'Watching' : 'Watch'}
          </Button>
        </div>
        <Card>
          <CardHeader title="Price" subtitle={bars?.simulated ? 'Simulated sandbox prices' : 'Closing prices'}
            action={<Segmented label="Chart range" size="sm" value={range} onChange={setRange} options={(['1D', '1W', '1M', '3M', '1Y', '5Y'] as const).map((r) => ({ value: r, label: r }))} />} />
          <CardBody>
            {pts.length ? <AreaChart data={pts} height={300} label={`${symbol} price, ${range}`} tone={rangeUp ? 'pos' : 'neg'} format={(v) => formatMoney(v)}
              formatTime={(t) => range === '1D' || range === '1W' ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })} />
              : <Skeleton className="h-[300px]" />}
          </CardBody>
        </Card>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader title="Quote" />
            <CardBody className="pt-2">
              <KeyValue items={[
                ['Bid', <span key="b" className="num">{q?.bid ?? '—'}</span>], ['Ask', <span key="a" className="num">{q?.ask ?? '—'}</span>],
                ['Previous close', <span key="p" className="num">{q?.previousClose ?? '—'}</span>], ['Source', q?.source ?? '—'],
                ['ISIN', inst?.isin ?? '—'], ['Fractional shares', inst ? (inst.fractionable ? 'Supported' : 'Not supported') : '—'],
              ]} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Your position" />
            <CardBody className="pt-2">
              {holding ? (
                <KeyValue items={[
                  ['Shares', <span key="s" className="num">{formatNumber(holding.quantity)}</span>], ['Average cost', <span key="c" className="num">{formatMoney(holding.avgEntryPrice)}</span>],
                  ['Market value', <span key="v" className="num">{formatMoney(holding.marketValue)}</span>],
                  ['Unrealised P/L', <span key="u" className={`num ${toneOf(holding.unrealizedPl) === 'pos' ? 'text-pos' : 'text-neg'}`}>{formatMoney(holding.unrealizedPl, 'USD', { sign: true })} ({formatPct(holding.unrealizedPlPct)})</span>],
                ]} />
              ) : <p className="py-6 text-center text-[13px] text-muted">You don't hold {symbol}.</p>}
            </CardBody>
          </Card>
        </div>
        {inst?.corporateActions?.length ? (
          <Card><CardHeader title="Corporate actions" /><CardBody className="pt-2">
            <KeyValue items={inst.corporateActions.map((c) => [c.type.replace(/_/g, ' '), `Ex ${formatDate(c.exDate)} · Pay ${formatDate(c.payDate)}`])} />
          </CardBody></Card>
        ) : null}
      </div>
      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        {active ? <OrderTicket symbol={symbol} owned={holding?.quantity} onPlaced={reload} /> : (
          <Card><CardBody className="space-y-3 text-center">
            <p className="text-[14px] font-medium">Trading opens once your account is active</p>
            <p className="text-[13px] text-muted">Complete account setup to place orders.</p>
            <a href="/app/onboarding"><Button variant="secondary">Continue setup</Button></a>
          </CardBody></Card>
        )}
        <p className="px-1 text-[11.5px] leading-relaxed text-faint">Orders are executed by our licensed brokerage partner. Market data shown is for information and may differ from the execution price.</p>
      </aside>
    </div>
  );
}
