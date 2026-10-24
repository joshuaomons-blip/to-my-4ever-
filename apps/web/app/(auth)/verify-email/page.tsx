'use client';
import { Alert, Button, Spinner } from '@aureon/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { AuthHeading } from '../AuthForm';

function Verify() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
  const [msg, setMsg] = useState('');
  const once = useRef(false);
  useEffect(() => {
    if (once.current || !token) return;
    once.current = true;
    api('/v1/auth/verify-email', { body: { token } }).then(() => setState('ok'), (e) => { setState('error'); setMsg(e instanceof ApiError ? e.message : 'Verification failed'); });
  }, [token]);
  if (!token) return <Alert tone="negative">This link is missing its token.</Alert>;
  if (state === 'pending') return <div className="flex items-center gap-3 text-muted"><Spinner />Verifying your email…</div>;
  if (state === 'error') return (<><AuthHeading title="Link expired" /><Alert tone="negative">{msg}</Alert><p className="mt-6 text-[13px]"><Link className="text-accent-strong hover:underline" href="/login">Back to sign in</Link></p></>);
  return (
    <>
      <AuthHeading title="Email verified" subtitle="Your email address is confirmed. Sign in to continue setting up your account." />
      <Link href="/login"><Button size="lg" block>Continue to sign in</Button></Link>
    </>
  );
}

export default function VerifyEmailPage() {
  return <Suspense><Verify /></Suspense>;
}
