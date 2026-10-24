'use client';
import { Alert, Button, Field, Input } from '@aureon/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { AuthHeading, FormError } from '../AuthForm';

function Reset() {
  const token = useSearchParams().get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (done) return (<><AuthHeading title="Password updated" subtitle="All other sessions were signed out." /><Link href="/login"><Button size="lg" block>Sign in</Button></Link></>);
  return (
    <>
      <AuthHeading title="Choose a new password" />
      <FormError error={error} />
      {!token ? <Alert tone="negative">This link is missing its token.</Alert> : null}
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get('password') !== f.get('confirm')) return setError('Passwords do not match');
        setBusy(true);
        try {
          await api('/v1/auth/password/reset', { body: { token, password: f.get('password') } });
          setDone(true);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Reset failed');
        } finally {
          setBusy(false);
        }
      }}>
        <Field label="New password" htmlFor="password" hint="At least 12 characters."><Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required /></Field>
        <Field label="Confirm password" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
        <Button type="submit" size="lg" block loading={busy} disabled={!token}>Update password</Button>
      </form>
    </>
  );
}

export default function ResetPage() {
  return <Suspense><Reset /></Suspense>;
}
