'use client';
import { Card, EmptyState, Skeleton, Table, formatDateTime, formatMoney } from '@aureon/ui';
import { LoadError } from '@/components/LoadError';
import { PageHeader } from '@/components/PageHeader';
import { useApi } from '@/lib/hooks';

interface Row { id: string; label: string; description: string; at: string; currency: string; changes: Record<'available' | 'pending' | 'held' | 'unsettled', string | null> }

const Delta = ({ v, ccy }: { v: string | null; ccy: string }) =>
  v === null ? <span className="text-faint">—</span> : <span className={Number(v) > 0 ? 'text-pos' : Number(v) < 0 ? 'text-neg' : ''}>{formatMoney(v, ccy, { sign: true })}</span>;

export default function ActivityPage() {
  const { data, loading, error } = useApi<Row[]>('/v1/activity?limit=200');
  return (
    <>
      <PageHeader title="Activity" description="Every cash movement recorded in your account ledger. Entries are never edited — corrections appear as separate reversing entries." />
      <Card>
        <LoadError error={error} />
        {loading && !data ? <div className="space-y-3 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div> : data?.length ? (
          <Table>
            <thead><tr><th>Date</th><th>Entry</th><th className="!text-right">Available</th><th className="hidden !text-right md:table-cell">Reserved</th><th className="hidden !text-right md:table-cell">Unsettled</th><th className="hidden !text-right lg:table-cell">Pending</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id + r.currency}>
                  <td className="whitespace-nowrap text-[12.5px] text-muted">{formatDateTime(r.at)}</td>
                  <td><span className="font-medium">{r.label}</span><span className="block text-[12.5px] text-muted">{r.description}</span></td>
                  <td className="num text-right"><Delta v={r.changes.available} ccy={r.currency} /></td>
                  <td className="num hidden text-right md:table-cell"><Delta v={r.changes.held} ccy={r.currency} /></td>
                  <td className="num hidden text-right md:table-cell"><Delta v={r.changes.unsettled} ccy={r.currency} /></td>
                  <td className="num hidden text-right lg:table-cell"><Delta v={r.changes.pending} ccy={r.currency} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="No activity yet" description="Deposits, trades, dividends and withdrawals will appear here." />}
      </Card>
    </>
  );
}
