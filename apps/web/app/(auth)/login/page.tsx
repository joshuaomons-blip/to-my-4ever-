'use client';
import { Button, Field, Input } from '@aureon/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { AuthHeading, FormError } from '../AuthForm';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next')?.startsWith('/app') ? params.get('next')! : '/app';

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ mfaRequired: boolean }>('/v1/auth/login', { body: { email: f.get('email'), password: f.get('password') } });
      router.replace(r.mfaRequired ? `/mfa?next=${encodeURIComponent(next)}` : next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in');
      setBusy(false);
    }
  };

  return (
    <>
      <AuthHeading title="Welcome back" subtitle={<>New to Aureon? <Link href="/register" className="font-medium text-accent-strong hover:underline">Create an account</Link></>} />
      <FormError error={error} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Password" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
        <div className="flex justify-end text-[13px]"><Link href="/forgot-password" className="text-muted hover:text-text">Forgot password?</Link></div>
        <Button type="submit" size="lg" block loading={busy}>Sign in</Button>
      </form>
    </>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
