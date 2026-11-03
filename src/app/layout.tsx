import type { Metadata, Viewport } from 'next'
import type { CSSProperties } from 'react'
import './globals.css'
import { ACCENTS, getSettings } from '@/server/settings'
import { ToastProvider } from '@/components/toast'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { branding } = await getSettings()
  return {
    title: { default: branding.platformName, template: `%s · ${branding.platformName}` },
    description: `${branding.platformName} is an independent platform for researching Tesla stock, funding an account and following a simulated TSLA portfolio. Not affiliated with Tesla, Inc.`,
    icons: { icon: '/favicon.svg' },
  }
}

export const viewport: Viewport = { themeColor: '#f5f6f7', width: 'device-width', initialScale: 1 }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { appearance } = await getSettings()
  return (
    <html lang="en" style={{ '--accent': ACCENTS[appearance.accent].hex } as CSSProperties}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh bg-canvas font-sans text-fg antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
