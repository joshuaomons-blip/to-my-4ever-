import 'server-only'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { User } from '@prisma/client'
import { prisma } from '@/server/db'
import { randomToken, sha256 } from '@/server/security/crypto'
import { can, isAdminRole, type Permission } from '@/server/auth/permissions'
import { getSettings } from '@/server/settings'

export type Scope = 'customer' | 'admin'

export const COOKIE = { customer: 'ti_session', admin: 'ti_admin' } as const

const POLICY: Record<Scope, { absoluteMs: number; idleMs: number }> = {
  customer: { absoluteMs: 30 * 24 * 3600_000, idleMs: 7 * 24 * 3600_000 },
  admin: { absoluteMs: 8 * 3600_000, idleMs: 60 * 60_000 },
}

export type SafeUser = Omit<User, 'passwordHash' | 'totpSecret'>

function strip(user: User): SafeUser {
   
  const { passwordHash, totpSecret, ...safe } = user
  return safe
}

export async function clientInfo() {
  const h = await headers()
  const ip = (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'local').trim()
  return { ip, userAgent: h.get('user-agent')?.slice(0, 300) ?? null }
}

export async function createSession(userId: string, scope: Scope, mfaPending: boolean) {
  const token = randomToken(32)
  const { ip, userAgent } = await clientInfo()
  const expiresAt = new Date(Date.now() + POLICY[scope].absoluteMs)
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, scope, ip, userAgent, mfaPending, expiresAt },
  })
  const jar = await cookies()
  jar.set(COOKIE[scope], token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

type Loaded = { session: { id: string; mfaPending: boolean; scope: string }; user: User }

async function loadSession(scope: Scope): Promise<Loaded | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE[scope])?.value
  if (!token || token.length > 200) return null
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } })
  if (!session || session.scope !== scope) return null
  const now = Date.now()
  if (session.expiresAt.getTime() < now || session.lastSeenAt.getTime() + POLICY[scope].idleMs < now) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {})
  }
  // Scope must match the user's role: customer cookies never authorise admin routes and vice versa.
  if (scope === 'admin' && !isAdminRole(session.user.role)) return null
  if (scope === 'customer' && session.user.role !== 'CUSTOMER') return null
  if (session.user.status === 'SUSPENDED') return null
  return { session, user: session.user }
}

/** Fully authenticated user for the scope (MFA completed), or null. */
export async function getCurrentUser(scope: Scope): Promise<SafeUser | null> {
  const loaded = await loadSession(scope)
  if (!loaded || loaded.session.mfaPending) return null
  return strip(loaded.user)
}

export async function getPendingMfa(scope: Scope) {
  const loaded = await loadSession(scope)
  if (!loaded || !loaded.session.mfaPending) return null
  return loaded
}

export async function getSessionId(scope: Scope) {
  const loaded = await loadSession(scope)
  return loaded?.session.id ?? null
}

export async function destroySession(scope: Scope) {
  const jar = await cookies()
  const token = jar.get(COOKIE[scope])?.value
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } })
  jar.delete(COOKIE[scope])
}

// ─── Page guards (server components) ────────────────────────────────

export async function requireCustomerPage(): Promise<SafeUser> {
  const user = await getCurrentUser('customer')
  if (!user) redirect('/login')
  return user
}

export async function requireAdminPage(permission?: Permission, opts: { allowMfaSetup?: boolean } = {}) {
  const user = await getCurrentUser('admin')
  if (!user) redirect('/admin/login')
  if (!opts.allowMfaSetup && !user.totpEnabled) {
    const settings = await getSettings()
    if (settings.security.requireAdminMfa) redirect('/admin/security?setup=required')
  }
  if (permission && !can(user, permission)) redirect('/admin?denied=' + encodeURIComponent(permission))
  return user
}
