import { Alert, Logo } from '@aureon/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LEGAL } from '../content';

export function generateStaticParams() {
  return Object.keys(LEGAL).map((doc) => ({ doc }));
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = LEGAL[doc];
  if (!d) notFound();
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/"><Logo /></Link>
      <h1 className="display mt-10 text-[36px] font-medium">{d.title}</h1>
      <Alert tone="warning" className="mt-4" title="Draft — pending professional legal review">This document is a placeholder and does not create legal obligations.</Alert>
      <div className="mt-8 space-y-6">
        {d.sections.map(([h, body]) => (
          <section key={h}><h2 className="text-[16px] font-semibold">{h}</h2><p className="mt-1.5 text-[15px] leading-relaxed text-muted">{body}</p></section>
        ))}
      </div>
      <nav className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-[13px] text-muted" aria-label="Legal">
        {Object.entries(LEGAL).map(([k, v]) => <Link key={k} href={`/legal/${k}`} className="hover:text-text">{v.title}</Link>)}
      </nav>
    </div>
  );
}
