'use client';
import { Badge, Card, EmptyState, Segmented, Skeleton, Table, formatDateTime, formatMoney, formatNumber } from '@aureon/ui';
import Link from 'next/link';
import { useState } from 'react';
import { LoadError } from '@/components/LoadError';
import { PageHeader } from '@/components/PageHeader';
import { useApi } from '@/lib/hooks';
import { ORDER_STATUS_TONE, label, type Order } from '@/lib/types';

export default function OrdersPage() {
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const { data, loading, error } = useApi<Order[]>(`/v1/orders?status=${tab}`, { refreshMs: tab === 'open' ? 5_000 : undefined });
  return (
    <>
      <PageHeader title="Orders" description="Every order is routed to our licensed brokerage partner. Statuses update as the partner reports them." />
      <Card>
        <LoadError error={error} />
        <div className="border-b border-border p-4"><Segmented label="Order status" value={tab} onChange={setTab} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'History' }]} /></div>
        {loading && !data ? <div className="space-y-3 p-5">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div> : data?.length ? (
          <Table>
            <thead><tr><th>Order</th><th>Status</th><th className="!text-right">Filled</th><th className="!text-right">Avg price</th><th className="hidden !text-right md:table-cell">Placed</th></tr></thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id} className="hover:bg-surface-2/50">
                  <td>
                    <Link href={`/app/orders/${o.id}`} className="block">
                      <span className={`mr-2 text-[12px] font-semibold uppercase ${o.side === 'buy' ? 'text-pos' : 'text-neg'}`}>{o.side}</span>
                      <span className="font-semibold">{o.symbol}</span>
                      <span className="block text-[12.5px] text-muted">{label(o.type)} · {o.timeInForce.toUpperCase()}{o.limitPrice ? ` · limit ${formatMoney(o.limitPrice)}` : ''}{o.stopPrice ? ` · stop ${formatMoney(o.stopPrice)}` : ''}</span>
                    </Link>
                  </td>
                  <td><Badge tone={ORDER_STATUS_TONE[o.status]} dot>{label(o.status)}</Badge></td>
                  <td className="num text-right">{formatNumber(o.filledQuantity)} / {formatNumber(o.quantity)}</td>
                  <td className="num text-right">{o.avgFillPrice ? formatMoney(o.avgFillPrice) : '—'}</td>
                  <td className="hidden text-right text-[12.5px] text-muted md:table-cell">{formatDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title={tab === 'open' ? 'No open orders' : 'No order history yet'} description="Place an order from any asset page." action={<Link href="/app/markets" className="text-[13px] font-medium text-accent-strong hover:underline">Browse markets</Link>} />}
      </Card>
    </>
  );
}
