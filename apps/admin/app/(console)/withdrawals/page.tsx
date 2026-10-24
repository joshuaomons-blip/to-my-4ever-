'use client';
import { Card, EmptyState, Segmented, Table, formatDateTime, formatMoney } from '@aureon/ui';
import Link from 'next/link';
import { useState } from 'react';
import { ReasonAction } from '@/components/ReasonAction';
import { Title } from '@/components/Shell';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { minor } from '@/lib/types';

interface W { id: string; user_id: string; display_name: string; amount_minor: string; currency: string; status: string; created_at: string; method: string; last4: string }

export default function Withdrawals() {
  const [status, setStatus] = useState('pending_review');
  const { data, reload } = useApi<W[]>(`/withdrawals?status=${status}`, { refreshMs: 15_000 });
  return (
    <>
      <Title title="Withdrawals" description="Withdrawals above the review threshold, first withdrawals and flagged requests wait here. Funds remain on hold until a decision." />
      <Card>
        <div className="border-b border-border p-4"><Segmented label="Status" value={status} onChange={setStatus} options={['pending_review', 'processing', 'completed', 'failed', 'rejected'].map((s) => ({ value: s, label: s.replace('_', ' ') }))} /></div>
        {data?.length ? (
          <Table>
            <thead><tr><th>Customer</th><th className="!text-right">Amount</th><th>Destination</th><th>Requested</th><th className="!text-right">Decision</th></tr></thead>
            <tbody>
              {data.map((w) => (
                <tr key={w.id}>
                  <td><Link href={`/customers/${w.user_id}`} className="font-medium hover:underline">{w.display_name}</Link></td>
                  <td className="num text-right">{formatMoney(minor(w.amount_minor), w.currency)}</td>
                  <td className="text-[13px]">{w.method} ···· {w.last4}</td>
                  <td className="text-[12.5px] text-muted">{formatDateTime(w.created_at)}</td>
                  <td className="space-x-1 text-right">{w.status === 'pending_review' ? <>
                    <ReasonAction label="Approve" variant="positive" title="Approve withdrawal" run={(reason) => api(`/withdrawals/${w.id}/decision`, { body: { decision: 'approve', reason } })} onDone={reload} />
                    <ReasonAction label="Reject" variant="danger" title="Reject withdrawal" description="Funds return to the customer's available cash." run={(reason) => api(`/withdrawals/${w.id}/decision`, { body: { decision: 'reject', reason } })} onDone={reload} />
                  </> : null}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="Nothing here" />}
      </Card>
    </>
  );
}
