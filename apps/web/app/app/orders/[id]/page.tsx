'use client';
import { Alert, Badge, Button, Card, CardBody, CardHeader, KeyValue, Spinner, Table, formatDateTime, formatMoney, formatNumber } from '@aureon/ui';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ApiError, api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { ORDER_STATUS_TONE, label, type Money, type Order } from '@/lib/types';

interface Detail {
  order: Order & { quoteAtSubmission: { last: string; asOf: string; source: string } };
  events: Array<{ event_type: string; from_status: string | null; to_status: string | null; source: string; occurred_at: string }>;
  executions: Array<{ id: string; partnerExecutionId: string; quantity: string; price: string; gross: Money; commission: Money; executedAt: string; settlementDate: string; settled: boolean }>;
}

const OPEN = ['pending_submit', 'submitted', 'accepted', 'partially_filled'];

export default function OrderDetail() {
  const id = String(useParams().id);
  const { data, reload } = useApi<Detail>(`/v1/orders/${id}`, { refreshMs: 4_000 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return <div className="flex justify-center py-20 text-muted"><Spinner /></div>;
  const o = data.order;
  return (
    <>
      <PageHeader eyebrow="Order" title={`${o.side === 'buy' ? 'Buy' : 'Sell'} ${formatNumber(o.quantity)} ${o.symbol}`}
        description={<span className="code text-[12.5px]">Client order ID {o.clientOrderId}</span>}
        actions={OPEN.includes(o.status) ? (
          <Button variant="secondary" loading={busy} onClick={async () => {
            setBusy(true); setError(null);
            try { await api(`/v1/orders/${id}/cancel`, { method: 'POST' }); await reload(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Cancel failed'); } finally { setBusy(false); }
          }}>Cancel order</Button>
        ) : <a href={`/api/v1/orders/${id}/confirmation`} target="_blank" rel="noreferrer"><Button variant="secondary">Confirmation summary</Button></a>} />
      {error ? <Alert tone="negative" className="mb-4">{error}</Alert> : null}
      {o.status === 'pending_submit' ? <Alert tone="warning" className="mb-4" title="Awaiting partner confirmation">We're confirming this order with our brokerage partner. It will never be submitted twice.</Alert> : null}
      {o.rejectReason ? <Alert tone="negative" className="mb-4" title={label(o.status)}>{o.rejectReason}</Alert> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Executions" subtitle="Reported by our brokerage partner — the authoritative record of your trade" />
            {data.executions.length ? (
              <Table className="mt-3">
                <thead><tr><th>Executed</th><th className="!text-right">Shares</th><th className="!text-right">Price</th><th className="!text-right">Value</th><th className="!text-right">Commission</th><th>Settlement</th></tr></thead>
                <tbody>
                  {data.executions.map((e) => (
                    <tr key={e.id}>
                      <td className="text-[12.5px]">{formatDateTime(e.executedAt, true)}<span className="code block text-[11px] text-faint">{e.partnerExecutionId}</span></td>
                      <td className="num text-right">{formatNumber(e.quantity)}</td>
                      <td className="num text-right">{formatMoney(e.price)}</td>
                      <td className="num text-right">{formatMoney(e.gross.amount)}</td>
                      <td className="num text-right">{formatMoney(e.commission.amount)}</td>
                      <td><Badge tone={e.settled ? 'positive' : 'neutral'}>{e.settled ? 'Settled' : `T+1 · ${e.settlementDate}`}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <CardBody><p className="text-[13px] text-muted">No executions yet.</p></CardBody>}
          </Card>
          <Card>
            <CardHeader title="Timeline" />
            <CardBody>
              <ol className="relative space-y-4 border-l border-border pl-5">
                {data.events.map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" aria-hidden="true" />
                    <p className="text-[13.5px] font-medium">{e.to_status && e.event_type === 'status_changed' ? label(e.to_status) : label(e.event_type)}</p>
                    <p className="text-[12px] text-muted">{formatDateTime(e.occurred_at, true)} · {e.source === 'provider' ? 'Brokerage partner' : label(e.source)}</p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader title="Details" action={<Badge tone={ORDER_STATUS_TONE[o.status]} dot>{label(o.status)}</Badge>} />
          <CardBody className="pt-2">
            <KeyValue items={[
              ['Type', `${label(o.type)} · ${o.timeInForce.toUpperCase()}`],
              ['Filled', <span key="f" className="num">{formatNumber(o.filledQuantity)} / {formatNumber(o.quantity)}</span>],
              ['Average fill', <span key="a" className="num">{o.avgFillPrice ? formatMoney(o.avgFillPrice) : '—'}</span>],
              ...(o.limitPrice ? [['Limit', <span key="l" className="num">{formatMoney(o.limitPrice)}</span>] as [string, React.ReactNode]] : []),
              ...(o.stopPrice ? [['Stop', <span key="s" className="num">{formatMoney(o.stopPrice)}</span>] as [string, React.ReactNode]] : []),
              ['Est. price at order', <span key="e" className="num">{formatMoney(o.estimatedPrice)}</span>],
              ['Quote used', <span key="q" className="text-[12px]">{o.quoteAtSubmission.source} · {formatDateTime(o.quoteAtSubmission.asOf, true)}</span>],
              ['Reserve', <span key="r" className="num">{formatMoney(o.reserved.amount)}</span>],
              ['Placed', formatDateTime(o.createdAt)],
              ['Completed', formatDateTime(o.terminalAt)],
            ]} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
