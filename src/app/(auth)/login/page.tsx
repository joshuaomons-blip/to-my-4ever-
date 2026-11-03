import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/server/auth/session'
import { AuthTitle } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/forms'
import { Alert } from '@/components/ui'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams
  if (await getCurrentUser('customer')) redirect('/app')
  return (
    <>
      <AuthTitle title="Welcome back" subtitle={<>New here? <Link href="/register" className="text-white underline-offset-4 hover:underline">Open a sandbox account</Link></>} />
      {sp.reset && <Alert tone="gain" className="mb-4">Password updated. Sign in with your new password.</Alert>}
      <LoginForm scope="customer" next={sp.next} />
    </>
  )
}
