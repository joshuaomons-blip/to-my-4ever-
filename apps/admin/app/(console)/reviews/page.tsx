'use client';
import { Badge, Card, EmptyState, Table, formatDateTime } from '@aureon/ui';
import Link from 'next/link';
import { ReasonAction } from '@/components/ReasonAction';
import { Title } from '@/components/Shell';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';

interface R { id: string; user_id: string; display_name: string; decision_reason: string | null; submitted_at: string; residence_country: string; nationality: string; is_politically_exposed: boolean; open_screening_matches: number }
interface Detail { screening: Array<{ id: string; status: string; matches: Array<{ name: string; list: string }>; reviewed_at: string | null }> }

function ScreeningActions({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { data } = useApi<Detail>(`/customers/${userId}`);
  const open = data?.screening.filter((s) => s.status === 'potential_match' && !s.reviewed_at) ?? [];
  return (
    <>
      {open.map((s) => (
        <span key={s.id} className="inline-flex gap-1">
          <ReasonAction label="False positive" title="Clear screening match" description={`Match: ${s.matches.map((m) => `${m.name} (${m.list})`).join(', ')}`} field="Evidence / rationale"
            run={(note) => api(`/screening/${s.id}/review`, { body: { outcome: 'false_positive', note } })} onDone={onDone} />
          <ReasonAction label="Confirm match" variant="danger" title="Confirm screening match" description="The account will be frozen. Escalate to the MLRO; any regulatory report is filed outside this system." field="Rationale"
            run={(note) => api(`/screening/${s.id}/review`, { body: { outcome: 'confirmed_match', note } })} onDone={onDone} />
        </span>
      ))}
    </>
  );
}

export default function Reviews() {
  const { data, reload } = useApi<R[]>('/onboarding/reviews');
  return (
    <>
      <Title title="Onboarding reviews" description="Applications routed to manual review by KYC results, screening matches or risk flags. Screening matches must be resolved before approval." />
      <Card>
        {data?.length ? (
          <Table>
            <thead><tr><th>Applicant</th><th>Flags</th><th>Submitted</th><th className="!text-right">Actions</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/customers/${r.user_id}`} className="font-medium hover:underline">{r.display_name}</Link><span className="block text-[12px] text-muted">{r.residence_country} resident · {r.nationality} national</span></td>
                  <td className="max-w-md text-[12.5px]">
                    <div className="flex flex-wrap gap-1">{r.open_screening_matches ? <Badge tone="negative">{r.open_screening_matches} screening match</Badge> : null}{r.is_politically_exposed ? <Badge tone="warning">PEP</Badge> : null}</div>
                    <p className="mt-1 text-muted">{r.decision_reason}</p>
                  </td>
                  <td className="text-[12.5px] text-muted">{formatDateTime(r.submitted_at)}</td>
                  <td className="space-x-1 text-right">
                    {r.open_screening_matches ? <ScreeningActions userId={r.user_id} onDone={reload} /> : (
                      <>
                        <ReasonAction label="Approve" variant="positive" title="Approve application" description="Opens a brokerage account with the partner." run={(reason) => api(`/onboarding/${r.id}/decision`, { body: { decision: 'approve', reason } })} onDone={reload} />
                        <ReasonAction label="Reject" variant="danger" title="Reject application" run={(reason) => api(`/onboarding/${r.id}/decision`, { body: { decision: 'reject', reason } })} onDone={reload} />
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="Queue is clear" />}
      </Card>
    </>
  );
}
