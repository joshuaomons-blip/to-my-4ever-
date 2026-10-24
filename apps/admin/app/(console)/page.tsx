'use client';
import { Card, CardBody, Icon, type IconName, Skeleton } from '@aureon/ui';
import Link from 'next/link';
import { Title } from '@/components/Shell';
import { useApi } from '@/lib/hooks';

type O = Record<string, number>;
const TILES: Array<[keyof O & string, string, string, IconName, boolean]> = [
  ['pendingReviews', 'Onboarding reviews', '/reviews', 'clipboard', true],
  ['withdrawalsPendingReview', 'Withdrawals to review', '/withdrawals', 'wallet', true],
  ['openAlerts', 'Open monitoring alerts', '/alerts', 'alert', true],
  ['openBreaks', 'Reconciliation breaks', '/reconciliation', 'scale', true],
  ['openComplaints', 'Open complaints', '/support', 'support', true],
  ['deadJobs', 'Dead-letter jobs', '/system', 'server', true],
  ['customers', 'Customers', '/customers', 'users', false],
  ['ordersToday', 'Orders today', '/customers', 'orders', false],
  ['openTickets', 'Open tickets', '/support', 'support', false],
  ['pendingLaunchGates', 'Launch gates pending', '/launch-gates', 'flag', false],
];

export default function Overview() {
  const { data } = useApi<O>('/overview', { refreshMs: 15_000 });
  return (
    <>
      <Title title="Overview" description="Work queues that need attention. Items requiring action are highlighted." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {TILES.map(([k, l, href, icon, actionable]) => {
          const v = data?.[k];
          const hot = actionable && (v ?? 0) > 0;
          return (
            <Link key={k} href={href}>
              <Card className={`h-full transition-colors hover:border-border-strong ${hot ? 'border-warn/40 bg-warn-soft/40' : ''}`}>
                <CardBody>
                  <Icon name={icon} className={hot ? 'text-warn' : 'text-faint'} />
                  <p className="mt-3 text-[12.5px] text-muted">{l}</p>
                  {data ? <p className="num mt-0.5 text-[26px] font-medium">{v}</p> : <Skeleton className="mt-1 h-8 w-12" />}
                </CardBody>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
