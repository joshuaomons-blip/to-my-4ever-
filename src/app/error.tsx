'use client'

import { buttonClass } from '@/components/ui'

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div>
        <p className="num text-sm text-accent">Error</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-mute">Please try again. If the problem persists, contact support.</p>
        <button onClick={reset} className={buttonClass('light', 'md', 'mt-8')}>Try again</button>
      </div>
    </div>
  )
}
