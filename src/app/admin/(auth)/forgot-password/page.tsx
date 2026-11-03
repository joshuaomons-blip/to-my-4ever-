import type { Metadata } from 'next'
import { AuthTitle } from '@/components/auth/auth-shell'
import { ForgotForm } from '@/components/auth/forms'

export const metadata: Metadata = { title: 'Admin password reset', robots: { index: false } }

export default function AdminForgotPage() {
  return (
    <>
      <AuthTitle title="Reset admin password" subtitle="A reset link will be sent to the administrator email on file." />
      <ForgotForm scope="admin" />
    </>
  )
}
