'use client';
import { Alert, Badge, Card, CardBody, formatDateTime } from '@aureon/ui';
import { ReasonAction } from '@/components/ReasonAction';
import { Title, can, useMe } from '@/components/Shell';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';

interface G { key: string; category: string; title: string; description: string; required_approvals: number; approvals: Array<{ staffId: string; name: string; evidenceRef: string; approvedAt: string }> }

export default function Gates() {
  const me = useMe();
  const { data, reload } = useApi<G[]>('/launch-gates');
  const pending = data?.filter((g) => g.approvals.length < g.required_approvals).length ?? 0;
  return (
    <>
      <Title title="Launch gates" description="The API refuses to start in live (real-money) mode until every gate has two approvals from different staff with evidence references." />
      <Alert tone={pending ? 'warning' : 'positive'} className="mb-6" title={pending ? `${pending} gate(s) pending — real-money operation is blocked` : 'All gates approved'}>
        Approvals are append-only and audited. Evidence should reference signed documents held in your compliance records system.
      </Alert>
      <div className="grid gap-4 lg:grid-cols-2">
        {data?.map((g) => {
          const done = g.approvals.length >= g.required_approvals;
          const mine = g.approvals.some((a) => a.staffId === me.id);
          return (
            <Card key={g.key}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div><Badge>{g.category}</Badge><h2 className="mt-2 text-[15px] font-semibold">{g.title}</h2><p className="mt-1 text-[13px] text-muted">{g.description}</p></div>
                  <Badge tone={done ? 'positive' : 'warning'}>{g.approvals.length}/{g.required_approvals}</Badge>
                </div>
                <ul className="mt-3 space-y-1 text-[12.5px] text-muted">{g.approvals.map((a) => <li key={a.staffId}>✓ {a.name} · {a.evidenceRef} · {formatDateTime(a.approvedAt)}</li>)}</ul>
                {!done && !mine && can(me, 'launch_gates.approve') ? <div className="mt-3"><ReasonAction label="Approve gate" title={g.title} field="Evidence reference" run={(evidenceRef) => api(`/launch-gates/${g.key}/approve`, { body: { evidenceRef } })} onDone={reload} /></div> : null}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
