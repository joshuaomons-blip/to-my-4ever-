'use client';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Table, Textarea, formatDate, formatDateTime } from '@aureon/ui';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ApiError, api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { label } from '@/lib/types';

interface Ticket { id: string; reference: string; subject: string; category: string; status: string; isComplaint: boolean; complaintDeadline: string | null; updatedAt: string }

export default function SupportPage() {
  const { data, reload } = useApi<Ticket[]>('/v1/support/tickets');
  const [cat, setCat] = useState('account');
  const [msg, setMsg] = useState<{ tone: 'positive' | 'negative'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeader title="Support" description="Ask a question or raise a complaint. Complaints follow our formal complaints procedure." />
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card>
          <CardHeader title="Your requests" />
          {data?.length ? (
            <Table className="mt-3">
              <thead><tr><th>Request</th><th>Status</th><th className="!text-right">Updated</th></tr></thead>
              <tbody>
                {data.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-2/50">
                    <td><Link href={`/app/support/${t.id}`} className="font-medium hover:underline">{t.subject}</Link><span className="num block text-[12px] text-muted">{t.reference} · {label(t.category)}{t.isComplaint && t.complaintDeadline ? ` · final response by ${formatDate(t.complaintDeadline)}` : ''}</span></td>
                    <td><Badge tone={t.status === 'resolved' || t.status === 'closed' ? 'positive' : t.status === 'pending_customer' ? 'warning' : 'info'}>{label(t.status)}</Badge></td>
                    <td className="text-right text-[12.5px] text-muted">{formatDateTime(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState title="No requests" description="We're here if you need us." />}
        </Card>
        <Card>
          <CardHeader title="New request" />
          <CardBody>
            <form className="space-y-4" onSubmit={async (e) => {
              e.preventDefault(); setBusy(true); setMsg(null);
              const form = e.currentTarget;
              const f = Object.fromEntries(new FormData(form));
              try { const r = await api<{ reference: string }>('/v1/support/tickets', { body: { ...f, category: cat } }); setMsg({ tone: 'positive', text: `Request ${r.reference} created.` }); form.reset(); reload(); }
              catch (err) { setMsg({ tone: 'negative', text: err instanceof ApiError ? err.message : 'Failed' }); } finally { setBusy(false); }
            }}>
              <Field label="Topic" htmlFor="category">
                <Select id="category" value={cat} onChange={(e) => setCat(e.target.value)}>
                  {['account', 'onboarding', 'funding', 'trading', 'technical', 'complaint', 'other'].map((c) => <option key={c} value={c}>{c === 'complaint' ? 'Make a complaint' : label(c)}</option>)}
                </Select>
              </Field>
              {cat === 'complaint' ? <Alert tone="info">We'll acknowledge your complaint promptly and aim to issue a final response within 8 weeks. If you remain dissatisfied you may be able to refer it to an ombudsman or regulator in your country. See our <Link href="/legal/complaints">complaints procedure</Link>.</Alert> : null}
              <Field label="Subject" htmlFor="subject"><Input id="subject" name="subject" required minLength={3} maxLength={200} /></Field>
              <Field label="Message" htmlFor="message" hint="Never include passwords or authenticator codes."><Textarea id="message" name="message" required maxLength={10000} /></Field>
              {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
              <Button type="submit" loading={busy}>Send</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
