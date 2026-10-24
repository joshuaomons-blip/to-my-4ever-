'use client';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Table } from '@aureon/ui';
import { useState } from 'react';
import { Title, useMe } from '@/components/Shell';
import { ApiError, api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { label } from '@/lib/types';

interface S { id: string; email: string; display_name: string; status: string; mfa_enabled: boolean; roles: string[] }
const ROLES = ['super_admin', 'compliance_officer', 'operations', 'finance', 'support_agent', 'auditor'];

export default function Staff() {
  const me = useMe();
  const { data, reload } = useApi<S[]>('/staff');
  const [roles, setRoles] = useState<string[]>(['support_agent']);
  const [msg, setMsg] = useState<{ tone: 'positive' | 'negative'; text: string } | null>(null);
  return (
    <>
      <Title title="Staff" description="Least privilege: grant only the roles a person needs. In production, provision staff through SSO with hardware-key MFA." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <Table>
            <thead><tr><th>Name</th><th>Roles</th><th>MFA</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data?.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.display_name}<span className="block text-[12px] font-normal text-muted">{s.email}</span></td>
                  <td><div className="flex flex-wrap gap-1">{s.roles.map((r) => <Badge key={r} tone="accent">{label(r)}</Badge>)}</div></td>
                  <td>{s.mfa_enabled ? <Badge tone="positive">Enrolled</Badge> : <Badge tone="warning">Pending</Badge>}</td>
                  <td><Badge tone={s.status === 'active' ? 'positive' : 'neutral'}>{s.status}</Badge></td>
                  <td className="text-right">{s.status === 'active' && s.id !== me.id ? <Button size="sm" variant="ghost" onClick={async () => { await api(`/staff/${s.id}/disable`, { method: 'POST' }); reload(); }}>Disable</Button> : null}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Invite staff member" />
          <CardBody>
            <form className="space-y-3" onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try { const r = await api<{ temporaryPassword: string; notice: string }>('/staff', { body: { email: f.get('email'), displayName: f.get('name'), roles } }); setMsg({ tone: 'positive', text: `Created. Temporary password: ${r.temporaryPassword}. ${r.notice}` }); reload(); }
              catch (err) { setMsg({ tone: 'negative', text: err instanceof ApiError ? err.message : 'Failed' }); }
            }}>
              <Field label="Name" htmlFor="name"><Input id="name" name="name" required /></Field>
              <Field label="Work email" htmlFor="email"><Input id="email" name="email" type="email" required /></Field>
              <fieldset className="space-y-1"><legend className="mb-1 text-[13px] font-medium">Roles</legend>
                {ROLES.map((r) => <Checkbox key={r} id={`r-${r}`} label={label(r)} checked={roles.includes(r)} onChange={(e) => setRoles((x) => (e.target.checked ? [...x, r] : x.filter((y) => y !== r)))} />)}
              </fieldset>
              {msg ? <Alert tone={msg.tone} className="break-all">{msg.text}</Alert> : null}
              <Button type="submit" disabled={!roles.length}>Create</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
