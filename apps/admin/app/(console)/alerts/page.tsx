'use client';
import { Badge, Card, EmptyState, Segmented, Table, formatDateTime } from '@aureon/ui';
import Link from 'next/link';
import { useState } from 'react';
import { ReasonAction } from '@/components/ReasonAction';
import { Title } from '@/components/Shell';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { label } from '@/lib/types';

interface A { id: string; user_id: string; display_name: string; rule: string; severity: string; status: string; details: Record<string, unknown>; created_at: string }
const SEV: Record<string, 'negative' | 'warning' | 'info' | 'neutral'> = { critical: 'negative', high: 'negative', medium: 'warning', low: 'info' };

export default function Alerts() {
  const [status, setStatus] = useState('open');
  const { data, reload } = useApi<A[]>(`/alerts?status=${status}`);
  return (
    <>
      <Title title="Transaction monitoring" description="Rule-based alerts for review. Regulatory filings (e.g. SAR/STR) are made outside this system by the MLRO and referenced here." />
      <Card>
        <div className="border-b border-border p-4"><Segmented label="Status" value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} /></div>
        {data?.length ? (
          <Table>
            <thead><tr><th>Severity</th><th>Rule</th><th>Customer</th><th>Details</th><th>Status</th><th className="!text-right">Actions</th></tr></thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id}>
                  <td><Badge tone={SEV[a.severity]} dot>{a.severity}</Badge></td>
                  <td className="font-medium">{label(a.rule)}<span className="block text-[12px] font-normal text-muted">{formatDateTime(a.created_at)}</span></td>
                  <td><Link href={`/customers/${a.user_id}`} className="hover:underline">{a.display_name}</Link></td>
                  <td className="code max-w-xs truncate text-[11.5px] text-muted">{JSON.stringify(a.details)}</td>
                  <td><Badge>{label(a.status)}</Badge></td>
                  <td className="space-x-1 whitespace-nowrap text-right">{a.status.startsWith('closed') ? null : <>
                    <ReasonAction label="Close — no action" title="Close alert" field="Closure note" run={(note) => api(`/alerts/${a.id}`, { method: 'PUT', body: { status: 'closed_no_action', note } })} onDone={reload} />
                    <ReasonAction label="Close — reported" variant="danger" title="Close as externally reported" field="Closure note" extra={{ label: 'External filing reference', placeholder: 'e.g. internal case or filing ID' }}
                      run={(note, ref) => api(`/alerts/${a.id}`, { method: 'PUT', body: { status: 'closed_reported', note, externalFilingRef: ref } })} onDone={reload} />
                  </>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="No alerts" />}
      </Card>
    </>
  );
}
