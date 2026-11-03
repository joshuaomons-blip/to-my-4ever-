import Link from 'next/link'
import { buttonClass } from '@/components/ui'

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="num text-sm text-accent">404</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-3 text-mute">The page you’re looking for doesn’t exist or has moved.</p>
        <div className="mt-8 flex justify-center gap-2">
          <Link href="/" className={buttonClass('light')}>Go home</Link>
          <Link href="/app" className={buttonClass('ghost')}>Dashboard</Link>
        </div>
      </div>
    </div>
  )
}
