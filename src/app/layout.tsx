import type { Metadata, Viewport } from 'next'
import type { CSSProperties } from 'react'
import './globals.css'
import { ACCENTS, getSettings } from '@/server/settings'
import { ToastProvider } from '@/components/toast'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { branding } = await getSettings()
  return {
    title: { default: `${branding.platformName} — Sandbox`, template: `%s · ${branding.platformName}` },
    description: `${branding.platformName} is an independent educational sandbox for learning about TSLA with virtual funds and simulated trades. Not affiliated with Tesla, Inc.`,
    icons: { icon: '/favicon.svg' },
  }
}

export const viewport: Viewport = { themeColor: '#080808', width: 'device-width', initialScale: 1 }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { appearance } = await getSettings()
  return (
    <html lang="en" style={{ '--accent': ACCENTS[appearance.accent].hex } as CSSProperties}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh bg-ink font-sans text-white antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
