'use client';
import { Alert, Button, Card, CardBody, Field, Input, Logo } from '@aureon/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';

export default function Login() {
  const router = useRouter();
  const [stage, setStage] = useState<'password' | 'enrol' | 'verify'>('password');
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed'); } finally { setBusy(false); } };
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm">
        <CardBody className="space-y-5 p-7">
          <Logo suffix="Admin" />
          <p className="text-[13px] text-muted">Restricted system. Access is logged and monitored.</p>
          {error ? <Alert tone="negative">{error}</Alert> : null}
          {stage === 'password' ? (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(async () => {
              const r = await api<{ mfaEnrolled: boolean }>('/auth/login', { body: { email: f.get('email'), password: f.get('password') } });
              if (r.mfaEnrolled) setStage('verify'); else { const s = await api<{ secret: string }>('/auth/mfa/setup', { method: 'POST' }); setSecret(s.secret); setStage('enrol'); }
            }); }}>
              <Field label="Work email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="username" required /></Field>
              <Field label="Password" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
              <Button type="submit" block loading={busy}>Continue</Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const code = String(new FormData(e.currentTarget).get('code')); run(async () => {
              await api(stage === 'enrol' ? '/auth/mfa/enable' : '/auth/mfa/verify', { body: { code }, retry: false });
              router.replace('/');
            }); }}>
              {stage === 'enrol' && secret ? <Alert tone="info" title="Enrol your authenticator">MFA is mandatory for staff. Add this key: <span className="num break-all">{secret}</span></Alert> : null}
              <Field label="Authenticator code" htmlFor="code"><Input id="code" name="code" inputMode="numeric" maxLength={6} autoFocus className="num tracking-[0.3em]" required /></Field>
              <Button type="submit" block loading={busy}>Verify</Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
