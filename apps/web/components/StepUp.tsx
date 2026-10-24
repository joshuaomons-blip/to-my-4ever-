'use client';
import { Button, Field, Input, Modal } from '@aureon/ui';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api, registerStepUp } from '@/lib/api';

/** Global MFA re-confirmation dialog for sensitive actions (withdrawals, linking payment methods). */
export function StepUpProvider() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    registerStepUp(
      () =>
        new Promise<boolean>((resolve) => {
          resolver.current = resolve;
          setCode('');
          setError(null);
          setOpen(true);
        }),
    );
    return () => void registerStepUp(null);
  }, []);

  const finish = (ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/v1/auth/step-up', { body: { code }, retryOnStepUp: false });
      finish(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => finish(false)} title="Confirm it's you" description="For your security, enter the 6-digit code from your authenticator app to continue.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Authenticator code" htmlFor="stepup-code" error={error}>
          <Input id="stepup-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-invalid={!!error} className="num text-center text-lg tracking-[0.4em]" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => finish(false)}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={code.length !== 6}>Confirm</Button>
        </div>
      </form>
    </Modal>
  );
}
