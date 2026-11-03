import { Megaphone } from 'lucide-react'
import { cn } from '@/lib/format'

export function AnnouncementBar({ items }: { items: { id: string; title: string; body: string; level: string }[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-2">
      {items.map((a) => (
        <div key={a.id} className={cn('flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm', a.level === 'warning' ? 'border-warn/25 bg-warn/[0.06]' : a.level === 'success' ? 'border-gain/20 bg-gain/[0.05]' : 'border-white/[0.08] bg-white/[0.025]')}>
          <Megaphone className={cn('mt-0.5 size-4 shrink-0', a.level === 'warning' ? 'text-warn' : a.level === 'success' ? 'text-gain' : 'text-silver')} />
          <p className="text-silver">
            <span className="font-medium text-white">{a.title}</span> <span className="text-mute">— {a.body}</span>
          </p>
        </div>
      ))}
    </div>
  )
}
