'use client';
import { Alert, Button, type ButtonProps, Field, Input, Modal, Textarea } from '@aureon/ui';
import { useState } from 'react';
import { ApiError } from '@/lib/api';

/** Button → dialog that captures a written justification (stored in the audit log) before calling the API. */
export function ReasonAction({ label, title, description, run, onDone, variant = 'secondary', size = 'sm', field = 'Reason', extra }: {
  label: string; title: string; description?: string; run: (reason: string, extra?: string) => Promise<unknown>; onDone?: () => void;
  variant?: ButtonProps['variant']; size?: ButtonProps['size']; field?: string; extra?: { label: string; placeholder?: string };
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [ex, setEx] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => { setOpen(true); setReason(''); setEx(''); setError(null); }}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} description={description}>
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError(null);
          try { await run(reason, ex || undefined); setOpen(false); onDone?.(); } catch (err) { setError(err instanceof ApiError ? err.message : 'Failed'); } finally { setBusy(false); }
        }}>
          {error ? <Alert tone="negative">{error}</Alert> : null}
          {extra ? <Field label={extra.label} htmlFor="ra-extra"><Input id="ra-extra" value={ex} onChange={(e) => setEx(e.target.value)} placeholder={extra.placeholder} /></Field> : null}
          <Field label={field} htmlFor="ra-reason" hint="Recorded permanently in the audit log."><Textarea id="ra-reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} required /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={busy} variant={variant === 'danger' ? 'danger' : 'primary'} disabled={reason.trim().length < 5}>Confirm</Button></div>
        </form>
      </Modal>
    </>
  );
}
