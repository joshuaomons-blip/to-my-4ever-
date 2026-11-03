import type { Metadata } from 'next'
import { ChevronDown } from 'lucide-react'
import { prisma } from '@/server/db'
import { EmptyState } from '@/components/ui'

export const metadata: Metadata = { title: 'FAQ' }

export default async function FaqPage() {
  const faqs = await prisma.faq.findMany({ where: { published: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="eyebrow">Help centre</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Frequently asked questions</h1>
      <div className="mt-10 divide-y divide-fg/[0.06] rounded-xl border border-fg/[0.06]">
        {faqs.length === 0 && <EmptyState title="No FAQs published yet" />}
        {faqs.map((f) => (
          <details key={f.id} className="group px-6 py-5 open:bg-fg/[0.015]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
              {f.question}
              <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-muted">{f.answer}</p>
          </details>
        ))}
      </div>
    </div>
  )
}
