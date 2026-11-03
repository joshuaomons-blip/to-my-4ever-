'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/format'

export function Modal({ open, onClose, title, children, className, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; className?: string; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-fg/30 backdrop-blur-sm" onClick={onClose} />
      <div ref={ref} className={cn('relative max-h-[92vh] w-full animate-pop overflow-y-auto rounded-t-3xl border border-fg/10 bg-surface p-6 shadow-2xl sm:rounded-xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md', className)}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="font-display text-lg font-medium tracking-tight">{title}</h2>
          <button data-close onClick={onClose} className="-m-1 rounded-full p-1 text-muted hover:bg-fg/5 hover:text-fg" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
