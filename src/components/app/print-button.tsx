'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui'

export function PrintButton() {
  return (
    <Button variant="ghost" size="sm" onClick={() => window.print()}>
      <Printer className="size-4" /> Print receipt
    </Button>
  )
}
