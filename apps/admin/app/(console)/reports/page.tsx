'use client';
import { Alert, Card, CardHeader, Field, Input, Table } from '@aureon/ui';
import { useState } from 'react';
import { Title } from '@/components/Shell';
import { useApi } from '@/lib/hooks';
import { label } from '@/lib/types';

type Row = Record<string, string | number>;
interface R { period: { from: string; to: string }; notice: string; [k: string]: unknown }

function Section({ title, rows }: { title: string; rows: Row[] }) {
  const cols = rows[0] ? Object.keys(rows[0]).filter((c) => c !== 'total_minor') : [];
  return (
    <Card><CardHeader title={title} />
      {rows.length ? <Table className="mt-3"><thead><tr>{cols.map((c) => <th key={c}>{label(c)}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className="num text-[13px]">{String(r[c] ?? '—')}</td>)}</tr>)}</tbody></Table>
        : <p className="px-5 py-6 text-[13px] text-muted">No data for period.</p>}
    </Card>
  );
}

export default function Reports() {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const { data } = useApi<R>(`/reports/compliance?from=${from}&to=${to}`);
  return (
    <>
      <Title title="Compliance reporting" description="Operational management information for the compliance function." />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Field label="From" htmlFor="from"><Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To" htmlFor="to"><Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {data ? <Alert tone="info" className="mb-6">{data.notice}</Alert> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        {data ? (['applicationsByStatus', 'applicationsByCountry', 'screening', 'alerts', 'complaints', 'restrictions', 'fundsFlow'] as const).map((k) => <Section key={k} title={label(k.replace(/([A-Z])/g, '_$1').toLowerCase())} rows={(data[k] as Row[]) ?? []} />) : null}
      </div>
    </>
  );
}
