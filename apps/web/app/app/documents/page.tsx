'use client';
import { Alert, Badge, Card, CardHeader, EmptyState, Table, formatDate, formatMoney } from '@aureon/ui';
import { PageHeader } from '@/components/PageHeader';
import { ApiError, api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useState } from 'react';
import { label } from '@/lib/types';

interface Doc { id: string; kind: string; title: string; periodStart: string | null; periodEnd: string | null; provider: string; createdAt: string }
interface Div { id: string; type: string; amountMinor: string; currency: string; description: string; occurredAt: string; symbol: string | null }

export default function DocumentsPage() {
  const { data: docs } = useApi<Doc[]>('/v1/documents');
  const { data: divs } = useApi<Div[]>('/v1/dividends');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Statements & documents" description="Official statements, trade confirmations and tax forms are issued by our brokerage partner." />
      {msg ? <Alert tone="warning" className="mb-4">{msg}</Alert> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Documents" />
          {docs?.length ? (
            <Table className="mt-3">
              <thead><tr><th>Document</th><th>Period</th><th /></tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td><span className="font-medium">{d.title}</span><span className="mt-0.5 block"><Badge>{label(d.kind)}</Badge></span></td>
                    <td className="text-[12.5px] text-muted">{d.periodStart ? `${formatDate(d.periodStart)} – ${formatDate(d.periodEnd)}` : formatDate(d.createdAt)}</td>
                    <td className="text-right"><button type="button" className="text-[13px] font-medium text-accent-strong hover:underline"
                      onClick={() => api(`/v1/documents/${d.id}/download`).catch((e) => setMsg(e instanceof ApiError ? e.message : 'Unavailable'))}>Download</button></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState title="No documents yet" description="Monthly statements appear after your first full month." />}
        </Card>
        <Card>
          <CardHeader title="Dividends & corporate actions" subtitle="As reported by our brokerage partner" />
          {divs?.length ? (
            <Table className="mt-3">
              <thead><tr><th>Date</th><th>Description</th><th className="!text-right">Amount</th></tr></thead>
              <tbody>
                {divs.map((d) => (
                  <tr key={d.id}>
                    <td className="text-[12.5px] text-muted">{formatDate(d.occurredAt)}</td>
                    <td><span className="font-medium">{d.symbol}</span><span className="block text-[12.5px] text-muted">{d.description}</span></td>
                    <td className="num text-right">{formatMoney(Number(d.amountMinor) / 100, d.currency, { sign: true })}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState title="No dividends yet" />}
        </Card>
      </div>
    </>
  );
}
