'use client';
import { Badge, Card, Table, formatDateTime, formatMoney } from '@aureon/ui';
import { Title } from '@/components/Shell';
import { useApi } from '@/lib/hooks';
import { label, minor } from '@/lib/types';

interface D { id: string; display_name: string; amount_minor: string; currency: string; provider: string; provider_payment_id: string | null; status: string; failure_reason: string | null; created_at: string; settled_at: string | null }

export default function Payments() {
  const { data } = useApi<D[]>('/payments/deposits', { refreshMs: 20_000 });
  return (
    <>
      <Title title="Deposits" description="Payment-provider references for reconciliation against provider settlement reports." />
      <Card>
        <Table>
          <thead><tr><th>Customer</th><th className="!text-right">Amount</th><th>Provider reference</th><th>Status</th><th>Created</th><th>Settled</th></tr></thead>
          <tbody>
            {data?.map((d) => (
              <tr key={d.id}>
                <td>{d.display_name}</td><td className="num text-right">{formatMoney(minor(d.amount_minor), d.currency)}</td>
                <td className="code text-[12px] text-muted">{d.provider}:{d.provider_payment_id ?? '—'}</td>
                <td><Badge tone={d.status === 'settled' ? 'positive' : d.status === 'failed' || d.status === 'returned' ? 'negative' : 'info'}>{label(d.status)}</Badge>{d.failure_reason ? <span className="block text-[12px] text-neg">{d.failure_reason}</span> : null}</td>
                <td className="text-[12.5px] text-muted">{formatDateTime(d.created_at)}</td><td className="text-[12.5px] text-muted">{formatDateTime(d.settled_at)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
