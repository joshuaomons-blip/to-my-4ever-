'use client';
import { Badge, Button, Card, CardBody, Checkbox, Select, Spinner, Textarea, cn, formatDateTime } from '@aureon/ui';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Title } from '@/components/Shell';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { label } from '@/lib/types';

interface T { reference: string; subject: string; status: string; display_name: string; is_complaint: boolean; messages: Array<{ id: string; author_type: string; body: string; internal: boolean; created_at: string }> }

export default function Ticket() {
  const id = String(useParams().id);
  const { data, reload } = useApi<T>(`/support/tickets/${id}`);
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [status, setStatus] = useState('pending_customer');
  if (!data) return <div className="flex justify-center py-20"><Spinner /></div>;
  return (
    <>
      <Title title={data.subject} description={`${data.reference} · ${data.display_name}`} actions={<div className="flex gap-1">{data.is_complaint ? <Badge tone="negative">Complaint</Badge> : null}<Badge>{label(data.status)}</Badge></div>} />
      <Card className="max-w-3xl"><CardBody className="space-y-3">
        {data.messages.map((m) => (
          <div key={m.id} className={cn('rounded-lg border px-4 py-3 text-[13.5px]', m.internal ? 'border-warn/30 bg-warn-soft/40' : m.author_type === 'staff' ? 'border-border bg-surface-2' : 'border-border')}>
            <p className="mb-1 text-[11.5px] text-faint">{m.internal ? 'Internal note' : label(m.author_type)} · {formatDateTime(m.created_at)}</p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
        <form className="space-y-3 border-t border-border pt-4" onSubmit={async (e) => { e.preventDefault(); await api(`/support/tickets/${id}/reply`, { body: { message: text, internal, status } }); setText(''); reload(); }}>
          <label htmlFor="r" className="sr-only">Reply</label>
          <Textarea id="r" value={text} onChange={(e) => setText(e.target.value)} required />
          <div className="flex flex-wrap items-center gap-4">
            <Checkbox id="internal" label="Internal note (not visible to customer)" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
            <label htmlFor="st" className="sr-only">Status</label>
            <Select id="st" value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-48">
              {['open', 'pending_customer', 'pending_internal', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </Select>
            <Button type="submit" disabled={!text.trim()}>Send</Button>
          </div>
        </form>
      </CardBody></Card>
    </>
  );
}
