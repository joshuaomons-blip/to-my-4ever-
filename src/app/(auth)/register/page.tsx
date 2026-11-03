import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/server/auth/session'
import { AuthTitle } from '@/components/auth/auth-shell'
import { RegisterForm } from '@/components/auth/forms'

export const metadata: Metadata = { title: 'Create account' }

export default async function RegisterPage() {
  if (await getCurrentUser('customer')) redirect('/app')
  return (
    <>
      <AuthTitle title="Open a sandbox account" subtitle={<>Already registered? <Link href="/login" className="text-white underline-offset-4 hover:underline">Sign in</Link></>} />
      <RegisterForm />
    </>
  )
}
