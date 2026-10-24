'use client';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Table, formatDateTime } from '@aureon/ui';
import { useState } from 'react';
import { ReasonAction } from '@/components/ReasonAction';
import { Title } from '@/components/Shell';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { label } from '@/lib/types';

interface D { runs: Array<{ id: string; status: string; started_at: string; summary: Record<string, unknown> }>; breaks: Array<{ id: string; kind: string; display_name: string | null; reference: string | null; expected: string; actual: string; difference: string | null; created_at: string }>; trialBalance: Array<{ currency: string; sum: string; balanced: boolean }> }

export default function Recon() {
  const { data, reload } = useApi<D>('/reconciliation');
  const [busy, setBusy] = useState(false);
  const balanced = data?.trialBalance.every((t) => t.balanced);
  return (
    <>
      <Title title="Reconciliation" description="Platform ledger and executions compared against the brokerage partner's authoritative records. Breaks are investigated and resolved manually; nothing is auto-corrected."
        actions={<Button loading={busy} onClick={async () => { setBusy(true); await api('/reconciliation/run', { method: 'POST' }).finally(() => setBusy(false)); reload(); }}>Run now</Button>} />
      {data ? <Alert tone={balanced ? 'positive' : 'negative'} className="mb-6" title={balanced ? 'Trial balance: balanced' : 'Trial balance: UNBALANCED'}>{data.trialBalance.map((t) => `${t.currency} ${t.sum}`).join(' · ') || 'No postings yet'}</Alert> : null}
      <Card className="mb-6">
        <CardHeader title="Open breaks" />
        {data?.breaks.length ? (
          <Table className="mt-3">
            <thead><tr><th>Kind</th><th>Customer</th><th>Reference</th><th className="!text-right">Expected</th><th className="!text-right">Partner</th><th className="!text-right">Difference</th><th /></tr></thead>
            <tbody>
              {data.breaks.map((b) => (
                <tr key={b.id}>
                  <td><Badge tone="negative">{label(b.kind)}</Badge></td><td>{b.display_name ?? '—'}</td><td className="code text-[12px]">{b.reference ?? '—'}</td>
                  <td className="num text-right">{b.expected}</td><td className="num text-right">{b.actual}</td><td className="num text-right text-neg">{b.difference ?? '—'}</td>
                  <td className="text-right"><ReasonAction label="Resolve" title="Resolve break" field="Root cause & resolution" run={(note) => api(`/reconciliation/breaks/${b.id}/resolve`, { body: { note } })} onDone={reload} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="No open breaks" />}
      </Card>
      <Card>
        <CardHeader title="Recent runs" />
        <Table className="mt-3">
          <thead><tr><th>Started</th><th>Status</th><th>Summary</th></tr></thead>
          <tbody>{data?.runs.map((r) => <tr key={r.id}><td className="text-[12.5px]">{formatDateTime(r.started_at, true)}</td><td><Badge tone={r.status === 'completed' ? 'positive' : r.status === 'failed' ? 'negative' : 'info'}>{r.status}</Badge></td><td className="code text-[12px] text-muted">{JSON.stringify(r.summary)}</td></tr>)}</tbody>
        </Table>
      </Card>
    </>
  );
}
