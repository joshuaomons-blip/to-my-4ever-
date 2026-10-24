'use client';
import { Alert, Badge, Button, Card, CardHeader, Checkbox, Field, Input, Modal, Select, Table, Textarea } from '@aureon/ui';
import { useState } from 'react';
import { ReasonAction } from '@/components/ReasonAction';
import { Title, can, useMe } from '@/components/Shell';
import { ApiError, api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { label } from '@/lib/types';

interface C { key: string; enabled: boolean; reason: string | null; updated_at: string }
interface J { code: string; name: string; region: string; status: string; onboarding_enabled: boolean; trading_enabled: boolean; deposits_enabled: boolean; withdrawals_enabled: boolean; legal_review_ref: string | null; notes: string | null }

function EditJurisdiction({ j, onDone }: { j: J; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(j);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => { setS(j); setOpen(true); setError(null); }} disabled={j.region === 'sanctioned'}>Edit</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${j.name} (${j.code})`} description="Enabling a country requires a recorded legal review. Live status additionally requires a legal review reference.">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setError(null);
          try { await api(`/jurisdictions/${j.code}`, { method: 'PUT', body: { status: s.status, onboardingEnabled: s.onboarding_enabled, tradingEnabled: s.trading_enabled, depositsEnabled: s.deposits_enabled, withdrawalsEnabled: s.withdrawals_enabled, legalReviewRef: s.legal_review_ref || undefined, reason } }); setOpen(false); onDone(); }
          catch (err) { setError(err instanceof ApiError ? err.message : 'Failed'); }
        }}>
          {error ? <Alert tone="negative">{error}</Alert> : null}
          <Field label="Status" htmlFor="js"><Select id="js" value={s.status} onChange={(e) => setS({ ...s, status: e.target.value })}>{['blocked', 'waitlist', 'sandbox_only', 'live'].map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-2">
            {(['onboarding', 'trading', 'deposits', 'withdrawals'] as const).map((k) => <Checkbox key={k} id={`j-${k}`} label={label(k)} checked={s[`${k}_enabled`]} onChange={(e) => setS({ ...s, [`${k}_enabled`]: e.target.checked })} />)}
          </div>
          <Field label="Legal review reference" htmlFor="lr"><Input id="lr" value={s.legal_review_ref ?? ''} onChange={(e) => setS({ ...s, legal_review_ref: e.target.value })} /></Field>
          <Field label="Reason" htmlFor="jr"><Textarea id="jr" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} required /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Save</Button></div>
        </form>
      </Modal>
    </>
  );
}

const Yes = ({ v }: { v: boolean }) => <span className={v ? 'text-pos' : 'text-faint'}>{v ? '●' : '○'}<span className="sr-only">{v ? 'enabled' : 'disabled'}</span></span>;

export default function Controls() {
  const me = useMe();
  const { data: controls, reload } = useApi<C[]>('/controls');
  const { data: js, reload: reloadJ } = useApi<J[]>('/jurisdictions');
  return (
    <>
      <Title title="Platform controls" description="Kill switches pause a capability platform-wide instantly. Jurisdiction rules determine who may onboard, trade and move money." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {controls?.map((c) => (
          <Card key={c.key} className="p-5">
            <div className="flex items-center justify-between"><p className="text-[13.5px] font-medium">{label(c.key.replace('_enabled', ''))}</p><Badge tone={c.enabled ? 'positive' : 'negative'} dot>{c.enabled ? 'Running' : 'Paused'}</Badge></div>
            <p className="mt-2 line-clamp-2 text-[12px] text-muted">{c.reason}</p>
            {can(me, 'controls.manage') ? <div className="mt-3"><ReasonAction label={c.enabled ? 'Pause' : 'Resume'} variant={c.enabled ? 'secondary' : 'positive'} title={`${c.enabled ? 'Pause' : 'Resume'} ${label(c.key.replace('_enabled', ''))}`}
              run={(reason) => api(`/controls/${c.key}`, { method: 'PUT', body: { enabled: !c.enabled, reason } })} onDone={reload} /></div> : null}
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Jurisdictions" subtitle="Sanctioned jurisdictions are locked and cannot be enabled from the console." />
        <Table className="mt-3">
          <thead><tr><th>Country</th><th>Status</th><th>Onboard</th><th>Trade</th><th>Deposit</th><th>Withdraw</th><th>Notes</th><th /></tr></thead>
          <tbody>
            {js?.map((j) => (
              <tr key={j.code}>
                <td className="font-medium">{j.name} <span className="text-faint">{j.code}</span></td>
                <td><Badge tone={j.status === 'live' ? 'positive' : j.status === 'sandbox_only' ? 'info' : j.region === 'sanctioned' ? 'negative' : 'neutral'}>{label(j.status)}</Badge></td>
                <td><Yes v={j.onboarding_enabled} /></td><td><Yes v={j.trading_enabled} /></td><td><Yes v={j.deposits_enabled} /></td><td><Yes v={j.withdrawals_enabled} /></td>
                <td className="max-w-sm text-[12px] text-muted">{j.notes}</td>
                <td className="text-right">{can(me, 'jurisdictions.manage') ? <EditJurisdiction j={j} onDone={reloadJ} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
