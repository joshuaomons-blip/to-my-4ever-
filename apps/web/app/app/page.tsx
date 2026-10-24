'use client';
import {
  Alert, AreaChart, Badge, Button, Card, CardBody, CardHeader, Donut, EmptyState, Icon, KeyValue, Segmented, Skeleton, Stat, Table,
  formatDateTime, formatMoney, formatNumber, formatPct, toneOf,
} from '@aureon/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useSession } from '@/components/AppShell';
import { useApi } from '@/lib/hooks';
import { ORDER_STATUS_TONE, label, type OnboardingStatus, type Order, type Portfolio, type Quote } from '@/lib/types';

function OnboardingCta({ s }: { s: OnboardingStatus }) {
  const steps = [
    ['Secure your account', s.steps.mfaEnabled],
    ['Personal & financial profile', s.steps.profileComplete],
    ['Review disclosures', s.steps.disclosuresAccepted],
    ['Submit application', s.steps.submitted],
  ] as const;
  const done = steps.filter(([, d]) => d).length;
  const terminal = s.status === 'ineligible' || s.status === 'rejected';
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="grid gap-0 md:grid-cols-[1.4fr_1fr]">
        <div className="p-6">
          <Badge tone={terminal ? 'negative' : 'accent'}>{terminal ? 'Application closed' : `Account setup · ${done} of 4`}</Badge>
          <h2 className="display mt-3 text-[24px] font-medium">
            {s.status === 'draft' ? 'Finish opening your brokerage account' : s.status === 'kyc_pending' ? 'We\'re verifying your identity' : s.status === 'manual_review' ? 'Your application is under review' : terminal ? 'We can\'t open an account right now' : 'Opening your account'}
          </h2>
          <p className="mt-2 max-w-lg text-[14px] text-muted">
            {terminal ? s.decisionReason ?? 'Please contact support for more information.' :
              s.status === 'draft' ? 'Your account is opened with our licensed brokerage partner once your identity and eligibility are confirmed.' :
              'You\'ll receive a notification as soon as there\'s an update. Most reviews complete within one business day.'}
          </p>
          {!terminal ? <Link href="/app/onboarding"><Button className="mt-5" variant="primary">{s.status === 'draft' ? 'Continue setup' : 'View status'}<Icon name="chevronRight" size={16} /></Button></Link> : null}
        </div>
        <ol className="space-y-3 border-t border-border bg-surface-2/50 p-6 md:border-l md:border-t-0">
          {steps.map(([name, ok], i) => (
            <li key={name} className="flex items-center gap-3 text-[13.5px]">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${ok ? 'bg-pos text-white' : 'border border-border-strong text-muted'}`}>
                {ok ? <Icon name="check" size={13} /> : i + 1}
              </span>
              <span className={ok ? 'text-muted line-through decoration-border-strong' : 'text-text'}>{name}</span>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

function Performance() {
  const [days, setDays] = useState<'30' | '90' | '365'>('90');
  const { data } = useApi<{ points: Array<{ t: string; equity: string }> }>(`/v1/portfolio/history?days=${days}`);
  const pts = (data?.points ?? []).map((p) => ({ t: p.t, v: Number(p.equity) }));
  const first = pts[0]?.v ?? 0;
  const last = pts[pts.length - 1]?.v ?? 0;
  return (
    <Card>
      <CardHeader title="Account value" subtitle="From partner-reported account snapshots"
        action={<Segmented label="Range" size="sm" value={days} onChange={setDays} options={[{ value: '30', label: '1M' }, { value: '90', label: '3M' }, { value: '365', label: '1Y' }]} />} />
      <CardBody className="pt-3">
        {pts.length >= 2 ? (
          <>
            <p className={`num mb-2 text-[13px] ${last >= first ? 'text-pos' : 'text-neg'}`}>{formatMoney(last - first, 'USD', { sign: true })} ({formatPct(first ? ((last - first) / first) * 100 : 0)}) over period</p>
            <AreaChart data={pts} height={220} label="Account value" tone={last >= first ? 'pos' : 'neg'} format={(v) => formatMoney(v)} formatTime={(t) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} />
          </>
        ) : (
          <EmptyState title="Performance history is building" description="We chart only values reported by our brokerage partner — nothing is back-filled or estimated. Check back after your account has been active for a while." />
        )}
      </CardBody>
    </Card>
  );
}

function Watchlist() {
  const { data: lists } = useApi<Array<{ id: string; name: string; items: Array<{ symbol: string; name: string }> }>>('/v1/watchlists');
  const symbols = lists?.[0]?.items.map((i) => i.symbol) ?? [];
  const defaults = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA'];
  const show = symbols.length ? symbols : defaults;
  const { data: quotes } = useApi<Quote[]>(`/v1/quotes?symbols=${show.join(',')}`, { refreshMs: 15_000 });
  return (
    <Card>
      <CardHeader title={symbols.length ? 'Watchlist' : 'Market movers'} subtitle={symbols.length ? undefined : 'Add symbols to your watchlist from any asset page'} />
      <ul className="mt-2 divide-y divide-border">
        {show.map((s) => {
          const q = quotes?.find((x) => x.symbol === s);
          const chg = q ? ((Number(q.last) - Number(q.previousClose)) / Number(q.previousClose)) * 100 : null;
          return (
            <li key={s}>
              <Link href={`/app/markets/${s}`} className="flex items-center justify-between px-5 py-3 hover:bg-surface-2/60">
                <span className="text-[13.5px] font-semibold">{s}</span>
                <span className="text-right">
                  <span className="num block text-[13.5px]">{q ? formatMoney(q.last) : '—'}</span>
                  <span className={`num block text-[12px] ${toneOf(chg) === 'pos' ? 'text-pos' : toneOf(chg) === 'neg' ? 'text-neg' : 'text-muted'}`}>{chg === null ? '' : formatPct(chg)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default function Dashboard() {
  const session = useSession();
  const { data: p, loading } = useApi<Portfolio>('/v1/portfolio', { refreshMs: 20_000 });
  const { data: onboarding } = useApi<OnboardingStatus>('/v1/onboarding');
  const { data: open } = useApi<Order[]>('/v1/orders?status=open', { refreshMs: 10_000 });
  const active = p?.account?.status === 'active';
  const ccy = p?.cash.currency ?? 'USD';
  const slices = useMemo(() => {
    if (!p?.holdings.length) return [];
    return [...p.holdings.map((h) => ({ key: h.symbol, label: h.symbol, value: Number(h.marketValue) })), { key: 'cash', label: 'Cash', value: Number(p.cash.total) }];
  }, [p]);

  return (
    <>
      <PageHeader eyebrow={new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${session.user.displayName.split(' ')[0]}`}
        actions={active ? <><Link href="/app/funding"><Button variant="secondary"><Icon name="plus" size={16} />Add funds</Button></Link><Link href="/app/markets"><Button>Trade</Button></Link></> : null} />

      {onboarding && onboarding.status !== 'approved' ? <OnboardingCta s={onboarding} /> : null}
      {p?.dataNotice ? <Alert tone="warning" className="mb-6">{p.dataNotice}</Alert> : null}

      <Card className="mb-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 p-5 sm:p-6 lg:grid-cols-5">
          {loading && !p ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />) : (
            <>
              <div className="col-span-2 lg:col-span-1 lg:border-r lg:border-border lg:pr-6">
                <Stat label="Estimated portfolio value" hint={p?.totals?.note} value={formatMoney(p?.totals?.estimatedPortfolioValue ?? p?.cash.total, ccy)}
                  sub={p?.totals ? `${formatMoney(p.totals.dayChange, ccy, { sign: true })} today` : 'Holdings + cash'} tone={toneOf(p?.totals?.dayChange)} />
              </div>
              <Stat label="Available cash" value={formatMoney(p?.cash.available, ccy)} sub={Number(p?.cash.pending) > 0 ? `${formatMoney(p?.cash.pending, ccy)} pending` : 'Settled & withdrawable'} />
              <Stat label="Buying power" hint="Reported by our brokerage partner" value={p?.buyingPower ? formatMoney(p.buyingPower.amount, ccy) : '—'}
                sub={p?.buyingPower ? (p.buyingPower.live ? 'Live from partner' : 'Last partner snapshot') : 'Account not active'} />
              <Stat label="Invested" value={formatMoney(p?.totals?.marketValue ?? '0', ccy)} sub={`Cost ${formatMoney(p?.totals?.costBasis ?? '0', ccy)}`} />
              <Stat label="Unrealised P/L" value={formatMoney(p?.totals?.unrealizedPl ?? '0', ccy, { sign: true })}
                sub={p?.totals && Number(p.totals.costBasis) > 0 ? formatPct((Number(p.totals.unrealizedPl) / Number(p.totals.costBasis)) * 100) : '—'} tone={toneOf(p?.totals?.unrealizedPl)} />
            </>
          )}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Performance />
          <Card>
            <CardHeader title="Holdings" subtitle={p?.account?.lastSyncedAt ? `Positions reported by partner · synced ${formatDateTime(p.account.lastSyncedAt)}` : 'Positions reported by our brokerage partner'} />
            <div className="mt-3">
              {p?.holdings.length ? (
                <Table>
                  <thead><tr><th>Asset</th><th className="!text-right">Quantity</th><th className="!text-right">Price</th><th className="!text-right">Value</th><th className="!text-right">Return</th></tr></thead>
                  <tbody>
                    {p.holdings.map((h) => (
                      <tr key={h.symbol} className="hover:bg-surface-2/50">
                        <td><Link href={`/app/markets/${h.symbol}`} className="block"><span className="font-semibold">{h.symbol}</span><span className="block max-w-[220px] truncate text-[12.5px] text-muted">{h.name}</span></Link></td>
                        <td className="num text-right">{formatNumber(h.quantity)}</td>
                        <td className="num text-right">{formatMoney(h.lastPrice, ccy)}{h.priceStale ? <Badge tone="negative" className="ml-1.5">Stale</Badge> : null}</td>
                        <td className="num text-right">{formatMoney(h.marketValue, ccy)}</td>
                        <td className={`num text-right ${toneOf(h.unrealizedPl) === 'pos' ? 'text-pos' : toneOf(h.unrealizedPl) === 'neg' ? 'text-neg' : ''}`}>
                          {formatMoney(h.unrealizedPl, ccy, { sign: true })}<span className="block text-[12px]">{formatPct(h.unrealizedPlPct)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <EmptyState title="No holdings yet" description={active ? 'Fund your account and place your first order.' : 'Holdings appear here once your account is open.'}
                  action={active ? <Link href="/app/markets"><Button variant="secondary">Explore markets</Button></Link> : null} />
              )}
            </div>
          </Card>
          {open?.length ? (
            <Card>
              <CardHeader title="Open orders" action={<Link href="/app/orders" className="text-[13px] text-accent-strong hover:underline">All orders</Link>} />
              <Table className="mt-3">
                <thead><tr><th>Order</th><th>Status</th><th className="!text-right">Filled</th><th className="!text-right">Placed</th></tr></thead>
                <tbody>
                  {open.map((o) => (
                    <tr key={o.id}>
                      <td><Link href={`/app/orders/${o.id}`} className="font-medium hover:underline">{o.side === 'buy' ? 'Buy' : 'Sell'} {formatNumber(o.quantity)} {o.symbol}</Link><span className="block text-[12px] text-muted">{label(o.type)}{o.limitPrice ? ` @ ${formatMoney(o.limitPrice)}` : ''}</span></td>
                      <td><Badge tone={ORDER_STATUS_TONE[o.status]} dot>{label(o.status)}</Badge></td>
                      <td className="num text-right">{formatNumber(o.filledQuantity)} / {formatNumber(o.quantity)}</td>
                      <td className="text-right text-[12.5px] text-muted">{formatDateTime(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Allocation" subtitle="By current market value" />
            <CardBody>
              {slices.length ? <Donut slices={slices} centerLabel="Total" centerValue={formatMoney(p?.totals?.estimatedPortfolioValue, ccy, { compact: true })} format={(v) => formatMoney(v, ccy)} />
                : <p className="py-6 text-center text-[13px] text-muted">Your allocation will appear after your first trade.</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Cash" subtitle="Recorded by Aureon; held at our partner" />
            <CardBody className="pt-2">
              <KeyValue items={[
                ['Available', <span key="a" className="num">{formatMoney(p?.cash.available, ccy)}</span>],
                ['Reserved for open orders', <span key="h" className="num">{formatMoney(p?.cash.held, ccy)}</span>],
                ['Unsettled sale proceeds', <span key="u" className="num">{formatMoney(p?.cash.unsettled, ccy)}</span>],
                ['Pending deposits', <span key="p" className="num">{formatMoney(p?.cash.pending, ccy)}</span>],
                ['Withdrawals in progress', <span key="w" className="num">{formatMoney(p?.cash.withdrawalHold, ccy)}</span>],
              ]} />
            </CardBody>
          </Card>
          <Watchlist />
        </div>
      </div>
    </>
  );
}
