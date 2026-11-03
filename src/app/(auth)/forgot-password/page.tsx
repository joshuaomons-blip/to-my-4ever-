import type { Metadata } from 'next'
import { AuthTitle } from '@/components/auth/auth-shell'
import { ForgotForm } from '@/components/auth/forms'

export const metadata: Metadata = { title: 'Reset password' }

export default function ForgotPage() {
  return (
    <>
      <AuthTitle title="Reset your password" subtitle="Enter your account email and we’ll send a secure reset link." />
      <ForgotForm scope="customer" />
    </>
  )
}
