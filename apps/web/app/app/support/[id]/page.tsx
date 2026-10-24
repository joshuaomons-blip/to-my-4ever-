'use client';
import { Badge, Button, Card, CardBody, Spinner, Textarea, cn, formatDate, formatDateTime } from '@aureon/ui';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { label } from '@/lib/types';

interface T { reference: string; subject: string; status: string; isComplaint: boolean; complaintDeadline: string | null; messages: Array<{ id: string; authorType: string; body: string; createdAt: string }> }

export default function Ticket() {
  const id = String(useParams().id);
  const { data, reload } = useApi<T>(`/v1/support/tickets/${id}`, { refreshMs: 15_000 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data) return <div className="flex justify-center py-20"><Spinner /></div>;
  return (
    <>
      <PageHeader eyebrow={data.reference} title={data.subject} actions={<Badge tone="info">{label(data.status)}</Badge>}
        description={data.isComplaint && data.complaintDeadline ? `Formal complaint · final response due by ${formatDate(data.complaintDeadline)}` : undefined} />
      <Card className="max-w-3xl">
        <CardBody className="space-y-4">
          {data.messages.map((m) => (
            <div key={m.id} className={cn('max-w-[85%] rounded-xl px-4 py-3 text-[14px]', m.authorType === 'customer' ? 'ml-auto bg-ink text-ink-contrast' : 'bg-surface-2')}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className={cn('mt-1 text-[11.5px]', m.authorType === 'customer' ? 'opacity-60' : 'text-faint')}>{m.authorType === 'customer' ? 'You' : m.authorType === 'system' ? 'Aureon' : 'Support'} · {formatDateTime(m.createdAt)}</p>
            </div>
          ))}
          {data.status !== 'closed' ? (
            <form className="space-y-3 border-t border-border pt-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await api(`/v1/support/tickets/${id}/messages`, { body: { message: text } }); setText(''); setBusy(false); reload(); }}>
              <label htmlFor="reply" className="sr-only">Reply</label>
              <Textarea id="reply" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…" required />
              <Button type="submit" loading={busy} disabled={!text.trim()}>Send reply</Button>
            </form>
          ) : null}
        </CardBody>
      </Card>
    </>
  );
}
