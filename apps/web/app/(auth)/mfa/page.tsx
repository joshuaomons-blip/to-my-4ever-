'use client';
import { Button, Field, Input } from '@aureon/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { AuthHeading, FormError } from '../AuthForm';

function Mfa() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next')?.startsWith('/app') ? params.get('next')! : '/app';
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/v1/auth/mfa/verify', { body: useRecovery ? { recoveryCode: value } : { code: value } });
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 401 ? 'Your session expired. Please sign in again.' : err.message) : 'Verification failed');
      setBusy(false);
    }
  };
  return (
    <>
      <AuthHeading title="Two-step verification" subtitle={useRecovery ? 'Enter one of your one-time recovery codes.' : 'Enter the 6-digit code from your authenticator app.'} />
      <FormError error={error} />
      <form onSubmit={submit} className="space-y-4">
        <Field label={useRecovery ? 'Recovery code' : 'Authenticator code'} htmlFor="code">
          <Input id="code" autoFocus autoComplete="one-time-code" inputMode={useRecovery ? 'text' : 'numeric'} value={value}
            onChange={(e) => setValue(useRecovery ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="num text-center text-lg tracking-[0.3em]" />
        </Field>
        <Button type="submit" size="lg" block loading={busy} disabled={useRecovery ? value.length < 6 : value.length !== 6}>Verify</Button>
        <button type="button" className="w-full text-center text-[13px] text-muted hover:text-text" onClick={() => { setUseRecovery((v) => !v); setValue(''); }}>
          {useRecovery ? 'Use authenticator app instead' : 'Lost your device? Use a recovery code'}
        </button>
      </form>
    </>
  );
}

export default function MfaPage() {
  return <Suspense><Mfa /></Suspense>;
}
