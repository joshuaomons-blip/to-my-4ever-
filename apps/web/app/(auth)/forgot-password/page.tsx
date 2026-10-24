'use client';
import { Alert, Button, Field, Input } from '@aureon/ui';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { AuthHeading } from '../AuthForm';

export default function ForgotPage() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <AuthHeading title="Reset your password" subtitle="We'll email you a link that's valid for 30 minutes." />
      {sent ? (
        <Alert tone="positive" title="Check your email">If an account exists for that address, a reset link is on its way.</Alert>
      ) : (
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await api('/v1/auth/password/forgot', { body: { email: new FormData(e.currentTarget).get('email') } }).catch(() => undefined);
          setSent(true);
        }}>
          <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
          <Button type="submit" size="lg" block loading={busy}>Send reset link</Button>
        </form>
      )}
      <p className="mt-6 text-[13px]"><Link className="text-accent-strong hover:underline" href="/login">Back to sign in</Link></p>
    </>
  );
}
