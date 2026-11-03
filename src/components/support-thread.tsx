import { cn, dateTimeFmt } from '@/lib/format'

export type ThreadMessage = { id: string; body: string; fromStaff: boolean; createdAt: Date; author: { firstName: string; lastName: string } | null }

export function SupportThread({ messages, staffView }: { messages: ThreadMessage[]; staffView?: boolean }) {
  return (
    <ol className="space-y-4">
      {messages.map((m) => (
        <li key={m.id} className={cn('rounded-md border p-4', m.fromStaff ? 'border-info/20 bg-info/[0.03]' : 'border-hairline bg-surface')}>
          <p className="text-[13px] text-muted">
            <span className="font-medium text-fg">{m.fromStaff ? (staffView && m.author ? `${m.author.firstName} ${m.author.lastName} (staff)` : 'Support team') : m.author ? `${m.author.firstName} ${m.author.lastName}` : 'Customer'}</span>
            {' · '}
            {dateTimeFmt(m.createdAt)}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-wrap text-fg-1">{m.body}</p>
        </li>
      ))}
    </ol>
  )
}
