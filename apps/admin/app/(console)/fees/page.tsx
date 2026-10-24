'use client';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, Table, Textarea, formatDateTime } from '@aureon/ui';
import { useState } from 'react';
import { Title, useMe } from '@/components/Shell';
import { ApiError, api } from '@/lib/api';
import { useApi } from '@/lib/hooks';

interface F { id: string; version: number; status: string; currency: string; commission_bps: number; commission_min_minor: string; commission_max_minor: string | null; fx_spread_bps: number; withdrawal_fee_minor: string; notes: string; created_by: string; approved_by: string | null; created_at: string }

export default function Fees() {
  const me = useMe();
  const { data, reload } = useApi<F[]>('/fees');
  const [msg, setMsg] = useState<{ tone: 'positive' | 'negative'; text: string } | null>(null);
  return (
    <>
      <Title title="Fee schedules" description="Maker-checker: a draft must be activated by a different staff member. Customer notice periods apply before changes take effect." />
      {msg ? <Alert tone={msg.tone} className="mb-4">{msg.text}</Alert> : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <Table>
            <thead><tr><th>Version</th><th>Status</th><th className="!text-right">Commission</th><th className="!text-right">Min / Max</th><th className="!text-right">FX spread</th><th>Created</th><th /></tr></thead>
            <tbody>
              {data?.map((f) => (
                <tr key={f.id}>
                  <td className="num">v{f.version}</td>
                  <td><Badge tone={f.status === 'active' ? 'positive' : f.status === 'draft' ? 'warning' : 'neutral'}>{f.status}</Badge></td>
                  <td className="num text-right">{(f.commission_bps / 100).toFixed(2)}%</td>
                  <td className="num text-right">${(Number(f.commission_min_minor) / 100).toFixed(2)} / {f.commission_max_minor ? `$${(Number(f.commission_max_minor) / 100).toFixed(2)}` : '—'}</td>
                  <td className="num text-right">{f.fx_spread_bps} bps</td>
                  <td className="text-[12.5px] text-muted">{formatDateTime(f.created_at)}<span className="block">{f.notes}</span></td>
                  <td className="text-right">{f.status === 'draft' ? (
                    <Button size="sm" disabled={f.created_by === me.id} title={f.created_by === me.id ? 'You created this draft; another approver is required' : undefined}
                      onClick={async () => { try { await api(`/fees/${f.id}/activate`, { method: 'POST' }); setMsg({ tone: 'positive', text: `v${f.version} activated.` }); reload(); } catch (e) { setMsg({ tone: 'negative', text: e instanceof ApiError ? e.message : 'Failed' }); } }}>Approve & activate</Button>
                  ) : null}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Propose new schedule" />
          <CardBody>
            <form className="space-y-3" onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const n = (k: string) => Math.round(Number(f.get(k)));
              try {
                await api('/fees', { body: { currency: 'USD', commissionBps: n('bps'), commissionMinMinor: Math.round(Number(f.get('min')) * 100), commissionMaxMinor: f.get('max') ? Math.round(Number(f.get('max')) * 100) : undefined, fxSpreadBps: n('fx'), depositFeeMinor: 0, withdrawalFeeMinor: Math.round(Number(f.get('wd')) * 100), notes: f.get('notes') } });
                setMsg({ tone: 'positive', text: 'Draft created. A second approver must activate it.' }); reload();
              } catch (err) { setMsg({ tone: 'negative', text: err instanceof ApiError ? err.message : 'Failed' }); }
            }}>
              <Field label="Commission (bps)" htmlFor="bps"><Input id="bps" name="bps" type="number" min={0} max={500} defaultValue={10} required /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Min ($)" htmlFor="min"><Input id="min" name="min" type="number" step="0.01" min={0} defaultValue={0} required /></Field>
                <Field label="Max ($)" htmlFor="max"><Input id="max" name="max" type="number" step="0.01" min={0} defaultValue={10} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="FX spread (bps)" htmlFor="fx"><Input id="fx" name="fx" type="number" min={0} max={500} defaultValue={25} required /></Field>
                <Field label="Withdrawal fee ($)" htmlFor="wd"><Input id="wd" name="wd" type="number" step="0.01" min={0} defaultValue={0} required /></Field>
              </div>
              <Field label="Rationale" htmlFor="notes"><Textarea id="notes" name="notes" minLength={5} required /></Field>
              <Button type="submit">Create draft</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
