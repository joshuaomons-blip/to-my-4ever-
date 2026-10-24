'use client';
import { Button, Field, Input, Modal } from '@aureon/ui';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api, registerStepUp } from '@/lib/api';

export function StepUpProvider() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  useEffect(() => {
    registerStepUp(() => new Promise<boolean>((r) => { resolver.current = r; setCode(''); setError(null); setOpen(true); }));
    return () => registerStepUp(null);
  }, []);
  const finish = (ok: boolean) => { setOpen(false); resolver.current?.(ok); resolver.current = null; };
  return (
    <Modal open={open} onClose={() => finish(false)} title="Re-authenticate" description="This action is sensitive and will be recorded in the audit log. Enter your authenticator code.">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try { await api('/auth/step-up', { body: { code }, retry: false }); finish(true); } catch (err) { setError(err instanceof ApiError ? err.message : 'Failed'); } finally { setBusy(false); }
      }}>
        <Field label="Authenticator code" htmlFor="su" error={error}><Input id="su" autoFocus inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="num text-center tracking-[0.4em]" /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => finish(false)}>Cancel</Button><Button type="submit" loading={busy} disabled={code.length !== 6}>Confirm</Button></div>
      </form>
    </Modal>
  );
}
