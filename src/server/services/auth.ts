import 'server-only'
import type { TokenPurpose, User } from '@prisma/client'
import { prisma } from '@/server/db'
import { getDummyHash, hashPassword, randomToken, sha256, verifyPassword } from '@/server/security/crypto'
import { verifyTotp } from '@/server/security/totp'
import { createSession, destroySession, type SafeUser, type Scope } from '@/server/auth/session'
import { isAdminRole } from '@/server/auth/permissions'
import { ApiError } from '@/server/http'
import { audit } from '@/server/audit'
import { appUrl, sendEmail } from '@/server/mailer'
import { getSettings } from '@/server/settings'
import { ensureAccount } from './ledger'

const TOKEN_TTL: Record<TokenPurpose, number> = { EMAIL_VERIFY: 24 * 3600_000, PASSWORD_RESET: 30 * 60_000 }

async function issueToken(userId: string, purpose: TokenPurpose) {
  await prisma.verificationToken.deleteMany({ where: { userId, purpose, usedAt: null } })
  const token = randomToken(32)
  await prisma.verificationToken.create({
    data: { userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TOKEN_TTL[purpose]) },
  })
  return token
}

async function consumeToken(token: string, purpose: TokenPurpose) {
  const row = await prisma.verificationToken.findUnique({ where: { tokenHash: sha256(token) } })
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) return null
  const claimed = await prisma.verificationToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } })
  return claimed.count === 1 ? row.userId : null
}

export async function sendVerificationEmail(user: Pick<User, 'id' | 'email' | 'firstName'>) {
  const token = await issueToken(user.id, 'EMAIL_VERIFY')
  const { branding } = await getSettings()
  await sendEmail(
    user.email,
    `Verify your ${branding.platformName} sandbox account`,
    `Hi ${user.firstName},\n\nConfirm your email to activate sandbox funding:\n${appUrl()}/verify-email?token=${token}\n\nThis link expires in 24 hours. If you did not create an account, ignore this email.\n\n— ${branding.platformName} (sandbox, simulated funds only)`,
  )
}

export async function registerCustomer(input: { firstName: string; lastName: string; email: string; password: string }, ip: string) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) {
    // Do not reveal whether the email exists: tell the owner by email instead.
    await sendEmail(input.email, 'Sign-up attempt', 'Someone tried to register with your email. If this was you, sign in or reset your password.')
    return
  }
  const user = await prisma.user.create({
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash: await hashPassword(input.password),
      role: 'CUSTOMER',
      kyc: { create: { status: 'NOT_STARTED' } },
    },
  })
  await ensureAccount(user.id)
  await prisma.notification.create({
    data: { userId: user.id, title: 'Welcome to the sandbox', body: 'Verify your email, complete sandbox identity verification, then fund your account with virtual money.', level: 'info' },
  })
  await sendVerificationEmail(user)
  await audit({ actor: user, action: 'customer.registered', targetType: 'user', targetId: user.id, ip })
  await createSession(user.id, 'customer', false)
}

const LOCK_AFTER = 5
const LOCK_MS = 15 * 60_000

export async function login(scope: Scope, email: string, password: string, ip: string): Promise<{ mfa: boolean }> {
  const user = await prisma.user.findUnique({ where: { email } })
  const generic = new ApiError(401, 'Incorrect email or password')
  if (!user) {
    await verifyPassword(password, await getDummyHash())
    throw generic
  }
  const roleOk = scope === 'admin' ? isAdminRole(user.role) : user.role === 'CUSTOMER'
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(423, 'Too many failed attempts. Try again in a few minutes or reset your password.')
  }
  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid || !roleOk) {
    const failed = user.failedLogins + 1
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: failed >= LOCK_AFTER ? 0 : failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MS) : null },
    })
    await audit({ actor: null, action: `${scope}.login_failed`, targetType: 'user', targetId: user.id, metadata: { reason: valid ? 'wrong_portal' : 'bad_password' }, ip })
    throw generic
  }
  if (user.status === 'SUSPENDED') {
    throw new ApiError(403, 'This account is suspended. Please contact support.')
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, ...(user.totpEnabled ? {} : { lastLoginAt: new Date() }) } })
  await createSession(user.id, scope, user.totpEnabled)
  if (!user.totpEnabled) await audit({ actor: user, action: `${scope}.login`, targetType: 'user', targetId: user.id, ip })
  return { mfa: user.totpEnabled }
}

export async function completeMfa(scope: Scope, sessionId: string, user: User, code: string, ip: string) {
  if (!user.totpSecret || !verifyTotp(user.totpSecret, code)) {
    await audit({ actor: user, action: `${scope}.mfa_failed`, targetType: 'user', targetId: user.id, ip })
    throw new ApiError(401, 'Invalid authentication code', { code: 'Invalid code' })
  }
  await prisma.session.update({ where: { id: sessionId }, data: { mfaPending: false } })
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await audit({ actor: user, action: `${scope}.login`, targetType: 'user', targetId: user.id, metadata: { mfa: true }, ip })
}

export async function logout(scope: Scope, user: SafeUser | null, ip: string) {
  await destroySession(scope)
  if (user) await audit({ actor: user, action: `${scope}.logout`, targetType: 'user', targetId: user.id, ip })
}

export async function verifyEmail(token: string, ip: string) {
  const userId = await consumeToken(token, 'EMAIL_VERIFY')
  if (!userId) return false
  const user = await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } })
  await audit({ actor: user, action: 'customer.email_verified', targetType: 'user', targetId: user.id, ip })
  return true
}

export async function requestPasswordReset(email: string, ip: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return
  const token = await issueToken(user.id, 'PASSWORD_RESET')
  const path = isAdminRole(user.role) ? '/admin/reset-password' : '/reset-password'
  await sendEmail(user.email, 'Reset your password', `Reset your password using this link (valid 30 minutes):\n${appUrl()}${path}?token=${token}\n\nIf you didn't request this, you can ignore this email.`)
  await audit({ actor: user, action: 'password.reset_requested', targetType: 'user', targetId: user.id, ip })
}

export async function resetPassword(token: string, password: string, ip: string) {
  const userId = await consumeToken(token, 'PASSWORD_RESET')
  if (!userId) throw new ApiError(400, 'This reset link is invalid or has expired')
  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, emailVerifiedAt: undefined },
  })
  // Reset proves email ownership; revoke every existing session.
  await prisma.session.deleteMany({ where: { userId } })
  if (!user.emailVerifiedAt) await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } })
  await audit({ actor: user, action: 'password.reset', targetType: 'user', targetId: user.id, ip })
}

export async function changePassword(user: SafeUser, current: string, next: string, keepSessionId: string | null, ip: string) {
  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  if (!(await verifyPassword(current, full.passwordHash))) throw new ApiError(400, 'Current password is incorrect', { currentPassword: 'Incorrect password' })
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } })
  await prisma.session.deleteMany({ where: { userId: user.id, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } })
  await audit({ actor: user, action: 'password.changed', targetType: 'user', targetId: user.id, ip })
}

/** One-time creation of the first super administrator. */
export async function createInitialSuperAdmin(input: { email: string; password: string; firstName: string; lastName: string }) {
  const exists = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } })
  if (exists > 0) throw new ApiError(409, 'Setup has already been completed')
  const taken = await prisma.user.findUnique({ where: { email: input.email } })
  if (taken) throw new ApiError(409, 'That email is already in use')
  return prisma.user.create({
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash: await hashPassword(input.password),
      role: 'SUPER_ADMIN',
      emailVerifiedAt: new Date(),
    },
  })
}
