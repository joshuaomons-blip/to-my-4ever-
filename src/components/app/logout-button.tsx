'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/format'

export function LogoutButton({ scope, className, compact }: { scope: 'customer' | 'admin'; className?: string; compact?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      onClick={async () => {
        setBusy(true)
        await api('/api/auth/logout', { body: { scope } })
        router.push(scope === 'admin' ? '/admin/login' : '/login')
        router.refresh()
      }}
      disabled={busy}
      className={cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-fg/[0.04] hover:text-fg disabled:opacity-50', className)}
    >
      <LogOut className="size-[18px]" />
      {!compact && 'Sign out'}
    </button>
  )
}
