'use client';
import { Alert, Badge, Card, CardHeader, Table, formatDateTime } from '@aureon/ui';
import { ReasonAction } from '@/components/ReasonAction';
import { Title } from '@/components/Shell';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';

interface S { jobs: Array<{ queue: string; status: string; n: number }>; deadJobs: Array<{ id: string; queue: string; attempts: number; last_error: string; created_at: string }>; webhooks: Array<{ provider: string; unprocessed: number; errored: number }>; activeSessions: Array<{ subject_type: string; n: number }>; trialBalance: Array<{ currency: string; balanced: boolean }>; pendingLaunchGates: string[] }

export default function System() {
  const { data, reload } = useApi<S>('/system', { refreshMs: 15_000 });
  const queues = [...new Set(data?.jobs.map((j) => j.queue) ?? [])];
  return (
    <>
      <Title title="System health" description="Background queues, provider webhooks and ledger integrity. Infrastructure metrics live in the monitoring stack (see docs/operations)." />
      {data && !data.trialBalance.every((t) => t.balanced) ? <Alert tone="negative" className="mb-4" title="Ledger trial balance failed">Investigate immediately.</Alert> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader title="Job queues (7 days)" />
          <Table className="mt-3"><thead><tr><th>Queue</th><th className="!text-right">Pending</th><th className="!text-right">Succeeded</th><th className="!text-right">Dead</th></tr></thead><tbody>
            {queues.map((q) => { const g = (s: string) => data?.jobs.find((j) => j.queue === q && j.status === s)?.n ?? 0; return (
              <tr key={q}><td className="num text-[12.5px]">{q}</td><td className="num text-right">{g('pending') + g('running')}</td><td className="num text-right">{g('succeeded')}</td><td className={`num text-right ${g('dead') ? 'text-neg' : ''}`}>{g('dead')}</td></tr>
            ); })}
          </tbody></Table>
        </Card>
        <Card><CardHeader title="Webhooks & sessions" />
          <Table className="mt-3"><tbody>
            {data?.webhooks.map((w) => <tr key={w.provider}><td>{w.provider}</td><td className="text-right"><Badge tone={w.errored ? 'negative' : 'positive'}>{w.unprocessed} unprocessed · {w.errored} errored</Badge></td></tr>)}
            {data?.activeSessions.map((s) => <tr key={s.subject_type}><td>Active {s.subject_type} sessions</td><td className="num text-right">{s.n}</td></tr>)}
          </tbody></Table>
        </Card>
        <Card className="xl:col-span-2"><CardHeader title="Dead-letter jobs" subtitle="Exhausted retries. Investigate the cause before re-queueing." />
          <Table className="mt-3"><thead><tr><th>Job</th><th>Error</th><th>Created</th><th /></tr></thead><tbody>
            {data?.deadJobs.map((j) => <tr key={j.id}><td className="code text-[12.5px]">#{j.id} {j.queue}<span className="block text-faint">{j.attempts} attempts</span></td><td className="max-w-lg text-[12px] text-neg">{j.last_error}</td><td className="text-[12px] text-muted">{formatDateTime(j.created_at)}</td>
              <td className="text-right"><ReasonAction label="Re-queue" title="Re-queue job" run={() => api(`/system/jobs/${j.id}/retry`, { method: 'POST' })} onDone={reload} /></td></tr>)}
          </tbody></Table>
        </Card>
      </div>
    </>
  );
}
