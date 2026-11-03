'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/components/toast'

export function ResendVerification() {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  return (
    <button
      disabled={busy}
      className="font-medium text-fg underline disabled:opacity-50"
      onClick={async () => {
        setBusy(true)
        const r = await api('/api/auth/resend-verification', { method: 'POST' })
        setBusy(false)
        toast(r.ok ? { tone: 'success', title: 'Verification email sent', body: 'Check your inbox.' } : { tone: 'error', title: r.error })
      }}
    >
      Resend email
    </button>
  )
}
