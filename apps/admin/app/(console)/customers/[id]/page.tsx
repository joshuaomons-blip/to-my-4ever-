'use client';
import { Badge, Card, CardBody, CardHeader, KeyValue, Select, Spinner, Table, formatDateTime, formatMoney } from '@aureon/ui';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ReasonAction } from '@/components/ReasonAction';
import { Title, can, useMe } from '@/components/Shell';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { label, minor } from '@/lib/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function Customer() {
  const id = String(useParams().id);
  const me = useMe();
  const { data, reload } = useApi<any>(`/customers/${id}`);
  const [type, setType] = useState('trading_block');
  if (!data) return <div className="flex justify-center py-20"><Spinner /></div>;
  const u = data.user;
  const b = data.balances;
  return (
    <>
      <Title title={u.display_name} description={<span className="code">{u.id}</span>}
        actions={can(me, 'restrictions.manage') ? (
          <div className="flex items-center gap-2">
            <label htmlFor="rt" className="sr-only">Restriction type</label>
            <Select id="rt" value={type} onChange={(e) => setType(e.target.value)} className="h-8 w-44 text-[13px]">
              {['trading_block', 'deposit_block', 'withdrawal_block', 'close_only', 'full_freeze'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </Select>
            <ReasonAction label="Apply restriction" variant="danger" title={`Apply ${label(type)}`} description="Takes effect immediately. Lifting requires a different staff member."
              run={(reason) => api(`/customers/${id}/restrictions`, { body: { type, reason } })} onDone={reload} />
          </div>
        ) : null} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card><CardHeader title="Account" /><CardBody className="pt-2"><KeyValue items={[
          ['Email', u.email], ['Status', <Badge key="s">{label(u.status)}</Badge>], ['MFA', u.mfa_enabled ? 'Enabled' : 'Off'], ['Residence', u.residence_country],
          ['Application', data.application ? label(data.application.status) : '—'], ['Partner account', data.brokerageAccount ? `${data.brokerageAccount.account_number ?? ''} · ${label(data.brokerageAccount.status)}` : '—'],
        ]} /></CardBody></Card>
        <Card><CardHeader title="Ledger balances (USD)" /><CardBody className="pt-2"><KeyValue items={[
          ['Available', formatMoney(b.available)], ['Reserved', formatMoney(b.held)], ['Unsettled', formatMoney(b.unsettled)], ['Pending deposits', formatMoney(b.pending)],
          ['Withdrawal hold', formatMoney(b.withdrawalHold)], ['Deficit', <span key="d" className={Number(b.deficit) > 0 ? 'text-neg' : ''}>{formatMoney(b.deficit)}</span>],
        ]} /></CardBody></Card>
        <Card><CardHeader title="Profile" subtitle={can(me, 'customers.pii') ? 'Full access (PII)' : 'Masked — no PII permission'} /><CardBody className="pt-2">
          <KeyValue items={Object.entries(data.profile ?? {}).filter(([k]) => !['user_id', 'updated_at'].includes(k)).slice(0, 12).map(([k, v]) => [label(k), String(v ?? '—')])} />
        </CardBody></Card>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card><CardHeader title="Restrictions" />
          <Table className="mt-3"><thead><tr><th>Type</th><th>Reason</th><th>Status</th><th /></tr></thead><tbody>
            {data.restrictions.map((r: any) => (
              <tr key={r.id}><td>{label(r.type)}</td><td className="text-[12.5px] text-muted">{r.reason}</td><td>{r.lifted_at ? <Badge>Lifted</Badge> : <Badge tone="negative">Active</Badge>}</td>
                <td className="text-right">{!r.lifted_at && can(me, 'restrictions.manage') ? <ReasonAction label="Lift" title="Lift restriction" description="Four-eyes rule: you cannot lift a restriction you applied." run={(reason) => api(`/restrictions/${r.id}/lift`, { body: { reason } })} onDone={reload} /> : null}</td></tr>
            ))}
          </tbody></Table>
        </Card>
        <Card><CardHeader title="Screening & KYC" />
          <Table className="mt-3"><thead><tr><th>Check</th><th>Result</th><th>Date</th></tr></thead><tbody>
            {data.kyc.map((k: any) => <tr key={k.id}><td>KYC · {k.provider}</td><td><Badge tone={k.status === 'clear' ? 'positive' : 'warning'}>{label(k.status)}</Badge></td><td className="text-[12.5px] text-muted">{formatDateTime(k.created_at)}</td></tr>)}
            {data.screening.map((s: any) => <tr key={s.id}><td>Sanctions/PEP · {s.provider}</td><td><Badge tone={s.status === 'clear' || s.status === 'false_positive' ? 'positive' : 'negative'}>{label(s.status)}</Badge></td><td className="text-[12.5px] text-muted">{formatDateTime(s.screened_at)}</td></tr>)}
          </tbody></Table>
        </Card>
        <Card><CardHeader title="Recent orders" />
          <Table className="mt-3"><thead><tr><th>Order</th><th>Status</th><th>Date</th></tr></thead><tbody>
            {data.orders.map((o: any) => <tr key={o.id}><td>{o.side} {Number(o.quantity)} {o.symbol} <span className="text-[12px] text-muted">({o.type})</span></td><td><Badge>{label(o.status)}</Badge></td><td className="text-[12.5px] text-muted">{formatDateTime(o.created_at)}</td></tr>)}
          </tbody></Table>
        </Card>
        <Card><CardHeader title="Funding" />
          <Table className="mt-3"><thead><tr><th>Type</th><th className="!text-right">Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>
            {[...data.deposits.map((d: any) => ({ ...d, kind: 'Deposit' })), ...data.withdrawals.map((w: any) => ({ ...w, kind: 'Withdrawal' }))].map((m: any) => (
              <tr key={m.id}><td>{m.kind}</td><td className="num text-right">{formatMoney(minor(m.amount_minor), m.currency)}</td><td><Badge>{label(m.status)}</Badge></td><td className="text-[12.5px] text-muted">{formatDateTime(m.created_at)}</td></tr>
            ))}
          </tbody></Table>
        </Card>
      </div>
    </>
  );
}
