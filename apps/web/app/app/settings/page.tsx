'use client';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, KeyValue, Table, ThemeToggle, formatDateTime } from '@aureon/ui';
import { useState } from 'react';
import { useSession } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import { ApiError, api } from '@/lib/api';
import { useApi } from '@/lib/hooks';

interface S { id: string; createdAt: string; lastSeenAt: string; ip: string | null; userAgent: string | null; current: boolean }

export default function SettingsPage() {
  const { user } = useSession();
  const { data: sessions, reload } = useApi<S[]>('/v1/auth/sessions');
  const [pw, setPw] = useState<{ tone: 'positive' | 'negative'; text: string } | null>(null);
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" subtitle="Legal details are locked after your application is submitted. Contact support to change them." />
          <CardBody className="pt-2"><KeyValue items={[['Name', user.displayName], ['Email', user.email], ['Country of residence', user.residenceCountry ?? '—'], ['Base currency', user.baseCurrency]]} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Appearance" />
          <CardBody className="flex items-center justify-between"><span className="text-[14px] text-muted">Theme</span><ThemeToggle /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Security" />
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between text-[14px]"><span>Two-factor authentication</span><Badge tone={user.mfaEnabled ? 'positive' : 'warning'} dot>{user.mfaEnabled ? 'Enabled' : 'Not enabled'}</Badge></div>
            <form className="space-y-3 border-t border-border pt-4" onSubmit={async (e) => {
              e.preventDefault(); setPw(null);
              const form = e.currentTarget;
              const f = new FormData(form);
              try { await api('/v1/auth/password/change', { body: { currentPassword: f.get('current'), newPassword: f.get('next') } }); setPw({ tone: 'positive', text: 'Password changed. Other sessions were signed out.' }); form.reset(); reload(); }
              catch (err) { setPw({ tone: 'negative', text: err instanceof ApiError ? err.message : 'Failed' }); }
            }}>
              <p className="text-[13px] font-medium">Change password</p>
              <Field label="Current password" htmlFor="current"><Input id="current" name="current" type="password" autoComplete="current-password" required /></Field>
              <Field label="New password" htmlFor="next"><Input id="next" name="next" type="password" autoComplete="new-password" minLength={12} required /></Field>
              {pw ? <Alert tone={pw.tone}>{pw.text}</Alert> : null}
              <Button type="submit" variant="secondary">Update password</Button>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Active sessions" />
          <Table className="mt-3">
            <thead><tr><th>Device</th><th>Last active</th><th /></tr></thead>
            <tbody>
              {sessions?.map((s) => (
                <tr key={s.id}>
                  <td className="max-w-[200px]"><span className="block truncate text-[13px]">{s.userAgent ?? 'Unknown device'}</span><span className="code text-[12px] text-muted">{s.ip}</span></td>
                  <td className="text-[12.5px] text-muted">{formatDateTime(s.lastSeenAt)}</td>
                  <td className="text-right">{s.current ? <Badge tone="accent">This device</Badge> : <Button size="sm" variant="ghost" onClick={async () => { await api(`/v1/auth/sessions/${s.id}`, { method: 'DELETE' }); reload(); }}>Revoke</Button>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
