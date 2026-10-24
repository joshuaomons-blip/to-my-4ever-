'use client';
import { Alert, Badge, Button, Card, Input, Table, formatDateTime } from '@aureon/ui';
import { useState } from 'react';
import { Title } from '@/components/Shell';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';

interface E { id: string; occurred_at: string; actor_type: string; actor_id: string | null; action: string; target_type: string | null; target_id: string | null; outcome: string; ip: string | null; metadata: Record<string, unknown> }

export default function Audit() {
  const [action, setAction] = useState('');
  const { data } = useApi<E[]>(`/audit${action ? `?action=${encodeURIComponent(action)}` : ''}`);
  const [verify, setVerify] = useState<{ entries: number; intact: boolean; firstBrokenId: string | null } | null>(null);
  return (
    <>
      <Title title="Audit log" description="Append-only and hash-chained. Each entry's SHA-256 covers the previous entry, so any alteration is detectable."
        actions={<Button variant="secondary" onClick={async () => setVerify(await api('/audit/verify'))}>Verify chain</Button>} />
      {verify ? <Alert tone={verify.intact ? 'positive' : 'negative'} className="mb-4" title={verify.intact ? 'Chain intact' : 'Chain broken'}>{verify.entries} entries checked{verify.firstBrokenId ? `; first inconsistency at #${verify.firstBrokenId}` : ''}.</Alert> : null}
      <Card>
        <div className="border-b border-border p-4"><label htmlFor="af" className="sr-only">Filter by action</label><Input id="af" placeholder="Filter by action prefix, e.g. funding." value={action} onChange={(e) => setAction(e.target.value)} className="max-w-sm" /></div>
        <Table>
          <thead><tr><th>#</th><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Outcome</th><th>Metadata</th></tr></thead>
          <tbody>
            {data?.map((e) => (
              <tr key={e.id}>
                <td className="num text-[12px] text-faint">{e.id}</td>
                <td className="whitespace-nowrap text-[12px]">{formatDateTime(e.occurred_at, true)}</td>
                <td className="text-[12px]">{e.actor_type}<span className="code block text-faint">{e.actor_id?.slice(0, 8)}</span></td>
                <td className="text-[13px] font-medium">{e.action}</td>
                <td className="text-[12px] text-muted">{e.target_type}<span className="code block">{e.target_id?.slice(0, 8)}</span></td>
                <td><Badge tone={e.outcome === 'success' ? 'positive' : 'negative'}>{e.outcome}</Badge></td>
                <td className="code max-w-xs truncate text-[11px] text-muted">{JSON.stringify(e.metadata)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
