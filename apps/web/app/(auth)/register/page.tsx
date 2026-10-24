'use client';
import { Alert, Button, Field, Input, Select } from '@aureon/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { AuthHeading, FormError } from '../AuthForm';

interface J { code: string; name: string; status: string; onboardingEnabled: boolean }

export default function RegisterPage() {
  const [countries, setCountries] = useState<J[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [country, setCountry] = useState('');

  useEffect(() => {
    api<J[]>('/v1/public/jurisdictions').then((j) => setCountries(j.filter((c) => c.status !== 'blocked' || c.code === country))).catch(() => undefined);
  }, [country]);

  const selected = countries.find((c) => c.code === country);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api('/v1/auth/register', { body: { email: f.get('email'), password: f.get('password'), displayName: f.get('displayName'), residenceCountry: country } });
      setDone(String(f.get('email')));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <>
        <AuthHeading title="Check your inbox" subtitle={<>If <strong className="text-text">{done}</strong> can be registered, we've sent a verification link. It expires in 24 hours.</>} />
        <Alert tone="info">In the sandbox, emails are captured by the platform instead of being sent. Developers can read them via the dev mailbox endpoint.</Alert>
        <p className="mt-6 text-[13px] text-muted"><Link href="/login" className="font-medium text-accent-strong hover:underline">Back to sign in</Link></p>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Open your account" subtitle={<>Already registered? <Link href="/login" className="font-medium text-accent-strong hover:underline">Sign in</Link></>} />
      <FormError error={error} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name" htmlFor="displayName"><Input id="displayName" name="displayName" autoComplete="name" required maxLength={120} /></Field>
        <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Password" htmlFor="password" hint="At least 12 characters. A passphrase works well.">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
        </Field>
        <Field label="Country of residence" htmlFor="country" hint="Availability depends on where you live.">
          <Select id="country" value={country} onChange={(e) => setCountry(e.target.value)} required>
            <option value="" disabled>Select a country</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}{c.onboardingEnabled ? '' : ' — not yet available'}</option>)}
          </Select>
        </Field>
        {selected && !selected.onboardingEnabled ? (
          <Alert tone="warning" title="Not yet available in your country">You can still register; we'll let you know if we're able to serve residents of {selected.name}.</Alert>
        ) : null}
        <Button type="submit" size="lg" block loading={busy} disabled={!country}>Create account</Button>
        <p className="text-[12px] leading-relaxed text-faint">By continuing you agree to our <Link className="underline" href="/legal/terms_of_service">Terms</Link> and acknowledge our <Link className="underline" href="/legal/privacy_policy">Privacy Policy</Link>.</p>
      </form>
    </>
  );
}
