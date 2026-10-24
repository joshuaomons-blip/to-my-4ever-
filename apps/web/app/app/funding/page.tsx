'use client';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal, Segmented, Select, Table, formatDateTime, formatMoney } from '@aureon/ui';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ApiError, api, newIdempotencyKey } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { label, type Money, type Portfolio } from '@/lib/types';

interface Method { id: string; type: string; label: string; last4: string; currency: string; status: string }
interface Movement { id: string; amount: Money; status: string; failureReason: string | null; createdAt: string; requiresReview?: boolean; fee?: Money }
interface Overview { methods: Method[]; deposits: Movement[]; withdrawals: Movement[]; limits: { depositMin: string; depositMaxPerTransaction: string; depositMaxPerDay: string } }

const TONE: Record<string, 'positive' | 'negative' | 'warning' | 'info' | 'neutral'> = {
  settled: 'positive', completed: 'positive', pending: 'info', initiated: 'info', processing: 'info', approved: 'info', pending_review: 'warning', failed: 'negative', returned: 'negative', rejected: 'negative', canceled: 'neutral',
};

function AddMethod({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Link a bank account" description="Sandbox: accounts are verified instantly. In production, ownership is verified by the payment provider (e.g. open banking or micro-deposits).">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        const f = Object.fromEntries(new FormData(e.currentTarget));
        try { await api('/v1/funding/methods', { body: { ...f, type: 'bank_account', currency: 'USD' } }); onAdded(); onClose(); }
        catch (err) { setError(err instanceof ApiError ? err.message : 'Could not link account'); } finally { setBusy(false); }
      }}>
        {error ? <Alert tone="negative">{error}</Alert> : null}
        <Field label="Nickname" htmlFor="label"><Input id="label" name="label" required maxLength={60} placeholder="Everyday checking" /></Field>
        <Field label="Last 4 digits of account number" htmlFor="last4"><Input id="last4" name="last4" required pattern="\d{4}" maxLength={4} inputMode="numeric" className="num" /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Link account</Button></div>
      </form>
    </Modal>
  );
}

export default function FundingPage() {
  const { data, reload } = useApi<Overview>('/v1/funding', { refreshMs: 8_000 });
  const { data: p } = useApi<Portfolio>('/v1/portfolio', { refreshMs: 8_000 });
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [methodId, setMethodId] = useState('');
  const [key, setKey] = useState(newIdempotencyKey());
  const [msg, setMsg] = useState<{ tone: 'positive' | 'negative' | 'warning'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const methods = data?.methods.filter((m) => m.status === 'verified') ?? [];
  const selected = methodId || methods[0]?.id || '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const r = await api<Movement>(`/v1/funding/${mode === 'deposit' ? 'deposits' : 'withdrawals'}`, { body: { amount, currency: 'USD', paymentMethodId: selected }, idempotencyKey: key });
      setMsg(mode === 'deposit'
        ? { tone: 'positive', text: `Deposit of ${formatMoney(r.amount.amount)} initiated. Funds become available once the payment provider confirms them.` }
        : r.status === 'pending_review'
          ? { tone: 'warning', text: `Withdrawal of ${formatMoney(r.amount.amount)} is being reviewed for your security. Funds are reserved meanwhile.` }
          : { tone: 'positive', text: `Withdrawal of ${formatMoney(r.amount.amount)} is being processed.` });
      setAmount(''); setKey(newIdempotencyKey()); reload();
    } catch (err) { setMsg({ tone: 'negative', text: err instanceof ApiError ? err.message : 'Request failed' }); } finally { setBusy(false); }
  };

  const history = [...(data?.deposits.map((d) => ({ ...d, kind: 'Deposit' })) ?? []), ...(data?.withdrawals.map((w) => ({ ...w, kind: 'Withdrawal' })) ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <PageHeader title="Funding" description="Move money between your bank and your brokerage account. Withdrawals go only to accounts you've deposited from." />
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardBody className="space-y-5">
              <Segmented label="Direction" value={mode} onChange={(v) => { setMode(v); setMsg(null); setKey(newIdempotencyKey()); }} options={[{ value: 'deposit', label: 'Deposit' }, { value: 'withdraw', label: 'Withdraw' }]} />
              <div className="rounded-lg bg-surface-2 px-4 py-3">
                <p className="text-[12.5px] text-muted">Available to {mode === 'deposit' ? 'invest' : 'withdraw'}</p>
                <p className="num text-[22px] font-medium">{formatMoney(p?.cash.available)}</p>
              </div>
              {methods.length ? (
                <form className="space-y-4" onSubmit={submit}>
                  <Field label="Amount (USD)" htmlFor="amount" hint={mode === 'deposit' && data ? `Min ${formatMoney(data.limits.depositMin)} · max ${formatMoney(data.limits.depositMaxPerTransaction)} per deposit` : 'Withdrawals require a fresh authenticator code.'}>
                    <Input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} className="num text-lg" placeholder="0.00" required />
                  </Field>
                  <Field label={mode === 'deposit' ? 'From' : 'To'} htmlFor="method">
                    <Select id="method" value={selected} onChange={(e) => setMethodId(e.target.value)}>
                      {methods.map((m) => <option key={m.id} value={m.id}>{m.label} ···· {m.last4}</option>)}
                    </Select>
                  </Field>
                  {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
                  <Button type="submit" block size="lg" loading={busy} disabled={!amount || Number(amount) <= 0}>{mode === 'deposit' ? 'Deposit funds' : 'Withdraw funds'}</Button>
                  {mode === 'deposit' ? <p className="text-[11.5px] text-faint">Sandbox tip: amounts ending in .13 simulate a failed payment.</p> : null}
                </form>
              ) : (
                <EmptyState title="Link a bank account" description="You need a verified bank account to move money." action={<Button onClick={() => setAdding(true)}>Link account</Button>} />
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Linked accounts" action={<Button size="sm" variant="ghost" onClick={() => setAdding(true)}>Add</Button>} />
            <ul className="mt-2 divide-y divide-border">
              {data?.methods.map((m) => (
                <li key={m.id} className="flex items-center justify-between px-5 py-3 text-[13.5px]">
                  <span>{m.label} <span className="num text-muted">···· {m.last4}</span></span>
                  <Badge tone={m.status === 'verified' ? 'positive' : 'warning'}>{label(m.status)}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card>
          <CardHeader title="Transfer history" />
          {history.length ? (
            <Table className="mt-3">
              <thead><tr><th>Type</th><th className="!text-right">Amount</th><th>Status</th><th className="!text-right">Date</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.kind}{h.failureReason ? <span className="block text-[12px] text-neg">{h.failureReason}</span> : null}</td>
                    <td className={`num text-right ${h.kind === 'Deposit' ? '' : 'text-muted'}`}>{h.kind === 'Deposit' ? '+' : '−'}{formatMoney(h.amount.amount)}</td>
                    <td><Badge tone={TONE[h.status] ?? 'neutral'} dot>{label(h.status)}</Badge></td>
                    <td className="text-right text-[12.5px] text-muted">{formatDateTime(h.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState title="No transfers yet" />}
        </Card>
      </div>
      <AddMethod open={adding} onClose={() => setAdding(false)} onAdded={reload} />
    </>
  );
}
