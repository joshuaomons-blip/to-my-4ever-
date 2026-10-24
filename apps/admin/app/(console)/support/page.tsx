'use client';
import { Badge, Card, Segmented, Table, formatDate, formatDateTime } from '@aureon/ui';
import Link from 'next/link';
import { useState } from 'react';
import { Title } from '@/components/Shell';
import { useApi } from '@/lib/hooks';
import { label } from '@/lib/types';

interface T { id: string; reference: string; subject: string; category: string; status: string; priority: string; is_complaint: boolean; complaint_deadline: string | null; display_name: string; updated_at: string }

export default function Support() {
  const [status, setStatus] = useState('active');
  const { data } = useApi<T[]>(`/support/tickets?status=${status}`, { refreshMs: 20_000 });
  return (
    <>
      <Title title="Support" description="Complaints are listed first by regulatory deadline." />
      <Card>
        <div className="border-b border-border p-4"><Segmented label="Status" value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'all', label: 'All' }]} /></div>
        <Table>
          <thead><tr><th>Ticket</th><th>Customer</th><th>Status</th><th>Deadline</th><th>Updated</th></tr></thead>
          <tbody>
            {data?.map((t) => {
              const overdue = t.complaint_deadline && new Date(t.complaint_deadline) < new Date();
              return (
                <tr key={t.id}>
                  <td><Link href={`/support/${t.id}`} className="font-medium hover:underline">{t.subject}</Link><span className="num block text-[12px] text-muted">{t.reference} · {label(t.category)}</span></td>
                  <td>{t.display_name}</td>
                  <td><div className="flex gap-1">{t.is_complaint ? <Badge tone="negative">Complaint</Badge> : null}<Badge>{label(t.status)}</Badge></div></td>
                  <td className={`text-[12.5px] ${overdue ? 'font-semibold text-neg' : 'text-muted'}`}>{t.complaint_deadline ? formatDate(t.complaint_deadline) : '—'}</td>
                  <td className="text-[12.5px] text-muted">{formatDateTime(t.updated_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
