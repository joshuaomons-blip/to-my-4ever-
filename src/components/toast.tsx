'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CircleCheck, CircleAlert, Info, X } from 'lucide-react'
import { cn } from '@/lib/format'

type Toast = { id: number; tone: 'success' | 'error' | 'info'; title: string; body?: string }
const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((all) => [...all.slice(-3), { ...t, id }])
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 5000)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-fade-up gap-3 rounded-2xl border border-white/10 bg-carbon-2/95 p-4 shadow-2xl backdrop-blur-xl">
            {t.tone === 'success' ? <CircleCheck className="size-5 shrink-0 text-gain" /> : t.tone === 'error' ? <CircleAlert className="size-5 shrink-0 text-loss" /> : <Info className="size-5 shrink-0 text-silver" />}
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', t.tone === 'error' ? 'text-loss' : 'text-white')}>{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs leading-relaxed text-mute">{t.body}</p>}
            </div>
            <button onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} className="text-dim hover:text-white" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
