'use client';
import { Alert, Badge, Button, Card, CardBody, Field, Input, KeyValue, Segmented, Select, formatMoney, formatNumber } from '@aureon/ui';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError, api, newIdempotencyKey } from '@/lib/api';
import { ORDER_STATUS_TONE, label, type Order, type Preview } from '@/lib/types';
import { Freshness } from './Freshness';

type Side = 'buy' | 'sell';
type OType = 'market' | 'limit' | 'stop' | 'stop_limit';

export function OrderTicket({ symbol, onPlaced, owned }: { symbol: string; onPlaced?: () => void; owned?: string }) {
  const [side, setSide] = useState<Side>('buy');
  const [type, setType] = useState<OType>('market');
  const [tif, setTif] = useState<'day' | 'gtc' | 'ioc' | 'fok'>('day');
  const [qty, setQty] = useState('');
  const [limit, setLimit] = useState('');
  const [stop, setStop] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [key, setKey] = useState<string>('');
  const [placed, setPlaced] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const body = () => ({ symbol, side, type, timeInForce: tif, quantity: qty, ...(type === 'limit' || type === 'stop_limit' ? { limitPrice: limit } : {}), ...(type === 'stop' || type === 'stop_limit' ? { stopPrice: stop } : {}) });
  const reset = () => { setPreview(null); setPlaced(null); setError(null); };

  const doPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      setPreview(await api<Preview>('/v1/orders/preview', { body: body() }));
      setKey(newIdempotencyKey()); // one key per reviewed order: double-clicks and retries can't duplicate it
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Preview failed'); } finally { setBusy(false); }
  };

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const o = await api<Order>('/v1/orders', { body: body(), idempotencyKey: key });
      setPlaced(o); setPreview(null); onPlaced?.();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Order failed'); } finally { setBusy(false); }
  };

  if (placed) {
    return (
      <Card><CardBody className="space-y-4">
        <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">Order received</h2><Badge tone={ORDER_STATUS_TONE[placed.status]} dot>{label(placed.status)}</Badge></div>
        <p className="text-[13.5px] text-muted">{placed.side === 'buy' ? 'Buy' : 'Sell'} {formatNumber(placed.quantity)} {symbol} · {label(placed.type)}. Filled {formatNumber(placed.filledQuantity)} of {formatNumber(placed.quantity)}{placed.avgFillPrice ? ` at avg ${formatMoney(placed.avgFillPrice)}` : ''}.</p>
        {placed.rejectReason ? <Alert tone="negative">{placed.rejectReason}</Alert> : null}
        <div className="flex gap-2"><Link href={`/app/orders/${placed.id}`}><Button variant="secondary">View order</Button></Link><Button variant="ghost" onClick={reset}>New order</Button></div>
      </CardBody></Card>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1" role="tablist" aria-label="Side">
          {(['buy', 'sell'] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={side === s} onClick={() => { setSide(s); reset(); }}
              className={`rounded-md py-2 text-[13.5px] font-semibold capitalize transition-colors ${side === s ? (s === 'buy' ? 'bg-pos text-white' : 'bg-neg text-white') : 'text-muted hover:text-text'}`}>{s}</button>
          ))}
        </div>
        {!preview ? (
          <form onSubmit={doPreview} className="space-y-4">
            <Field label="Order type" htmlFor="otype">
              <Select id="otype" value={type} onChange={(e) => { setType(e.target.value as OType); reset(); }}>
                <option value="market">Market</option><option value="limit">Limit</option><option value="stop">Stop</option><option value="stop_limit">Stop limit</option>
              </Select>
            </Field>
            <Field label="Quantity (shares)" htmlFor="qty" hint={side === 'sell' && owned ? `You hold ${formatNumber(owned)}` : type === 'market' ? 'Fractional quantities allowed where supported' : undefined}>
              <Input id="qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" className="num" required />
            </Field>
            {type === 'limit' || type === 'stop_limit' ? <Field label="Limit price (USD)" htmlFor="limit"><Input id="limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ''))} className="num" required /></Field> : null}
            {type === 'stop' || type === 'stop_limit' ? <Field label="Stop price (USD)" htmlFor="stop"><Input id="stop" inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value.replace(/[^\d.]/g, ''))} className="num" required /></Field> : null}
            <Field label="Time in force" htmlFor="tif">
              <Segmented label="Time in force" size="sm" value={tif} onChange={setTif} options={[{ value: 'day', label: 'Day' }, { value: 'gtc', label: 'GTC' }, { value: 'ioc', label: 'IOC' }, { value: 'fok', label: 'FOK' }]} />
            </Field>
            {error ? <Alert tone="negative">{error}</Alert> : null}
            <Button type="submit" block size="lg" variant="secondary" loading={busy} disabled={!qty || Number(qty) <= 0}>Review order</Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between"><p className="text-[13px] font-medium">Review</p><Freshness q={preview.quote} /></div>
            <KeyValue items={[
              ['Order', `${preview.side === 'buy' ? 'Buy' : 'Sell'} ${formatNumber(preview.quantity)} ${preview.symbol}`],
              ['Type', `${label(preview.type)} · ${preview.timeInForce.toUpperCase()}`],
              ['Estimated price', <span key="p" className="num">{formatMoney(preview.estimatedPrice)}</span>],
              ['Estimated value', <span key="v" className="num">{formatMoney(preview.estimatedNotional.amount)}</span>],
              ['Commission (est.)', <span key="c" className="num">{formatMoney(preview.estimatedCommission.amount)}</span>],
              [preview.side === 'buy' ? 'Estimated total' : 'Estimated proceeds', <span key="t" className="num font-semibold">{formatMoney(preview.estimatedTotal.amount)}</span>],
              ...(preview.side === 'buy' ? [['Reserved until filled', <span key="r" className="num">{formatMoney(preview.reserveAmount.amount)}</span>] as [string, React.ReactNode]] : []),
              ['Available cash', <span key="a" className="num">{formatMoney(preview.availableCash.amount)}</span>],
            ]} />
            {preview.blockers.map((b) => <Alert key={b} tone="negative">{b}</Alert>)}
            {preview.warnings.map((w) => <Alert key={w} tone="warning">{w}</Alert>)}
            <p className="text-[12px] leading-relaxed text-faint">{preview.disclosure}</p>
            {error ? <Alert tone="negative">{error}</Alert> : null}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setPreview(null)}>Edit</Button>
              <Button block size="lg" variant={side === 'buy' ? 'positive' : 'danger'} disabled={!preview.canSubmit} loading={busy} onClick={submit}>
                Confirm {side}
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
