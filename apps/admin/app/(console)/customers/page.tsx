'use client';
import { Badge, Card, Input, Table, formatDate } from '@aureon/ui';
import Link from 'next/link';
import { useState } from 'react';
import { Title } from '@/components/Shell';
import { useApi } from '@/lib/hooks';
import { label } from '@/lib/types';

interface C { id: string; email: string; display_name: string; status: string; residence_country: string | null; created_at: string; app_status: string | null; account_status: string | null }

export default function Customers() {
  const [q, setQ] = useState('');
  const { data } = useApi<C[]>(`/customers?q=${encodeURIComponent(q)}`);
  return (
    <>
      <Title title="Customers" description="Viewing a customer record is audited. Personal data is masked unless your role grants PII access." />
      <Card>
        <div className="border-b border-border p-4"><label className="sr-only" htmlFor="cq">Search</label><Input id="cq" placeholder="Search name, email or ID" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" /></div>
        <Table>
          <thead><tr><th>Customer</th><th>Country</th><th>Application</th><th>Brokerage account</th><th>Joined</th></tr></thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id} className="hover:bg-surface-2/50">
                <td><Link href={`/customers/${c.id}`} className="font-medium hover:underline">{c.display_name}</Link><span className="block text-[12px] text-muted">{c.email}</span></td>
                <td>{c.residence_country ?? '—'}</td>
                <td>{c.app_status ? <Badge tone={c.app_status === 'approved' ? 'positive' : c.app_status === 'manual_review' ? 'warning' : ['rejected', 'ineligible'].includes(c.app_status) ? 'negative' : 'neutral'}>{label(c.app_status)}</Badge> : '—'}</td>
                <td>{c.account_status ? <Badge tone={c.account_status === 'active' ? 'positive' : 'neutral'}>{label(c.account_status)}</Badge> : '—'}</td>
                <td className="text-[12.5px] text-muted">{formatDate(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
