import 'server-only'
import QRCode from 'qrcode'
import { prisma } from '@/server/db'
import { ApiError } from '@/server/http'
import { generateTotpSecret, otpauthUrl, verifyTotp } from '@/server/security/totp'
import { verifyPassword } from '@/server/security/crypto'
import { audit } from '@/server/audit'
import { getSettings } from '@/server/settings'
import type { SafeUser } from '@/server/auth/session'

export async function beginMfaSetup(user: SafeUser) {
  if (user.totpEnabled) throw new ApiError(409, 'Two-factor authentication is already enabled')
  const secret = generateTotpSecret()
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } })
  const { branding } = await getSettings()
  const url = otpauthUrl(secret, user.email, branding.platformName)
  return { secret, qr: await QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#0a0a0a', light: '#ffffff' } }) }
}

export async function confirmMfa(user: SafeUser, code: string, ip: string) {
  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  if (!full.totpSecret) throw new ApiError(400, 'Start setup first')
  if (!verifyTotp(full.totpSecret, code)) throw new ApiError(400, 'That code is not valid. Check your device clock and try again.', { code: 'Invalid code' })
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } })
  await audit({ actor: user, action: 'mfa.enabled', targetType: 'user', targetId: user.id, ip })
}

export async function disableMfa(user: SafeUser, password: string, code: string, ip: string) {
  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  if (!full.totpEnabled || !full.totpSecret) throw new ApiError(400, 'Two-factor authentication is not enabled')
  if (!(await verifyPassword(password, full.passwordHash))) throw new ApiError(400, 'Incorrect password', { password: 'Incorrect password' })
  if (!verifyTotp(full.totpSecret, code)) throw new ApiError(400, 'Invalid code', { code: 'Invalid code' })
  if (full.role !== 'CUSTOMER' && (await getSettings()).security.requireAdminMfa)
    throw new ApiError(403, 'Two-factor authentication is required for administrators')
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } })
  await audit({ actor: user, action: 'mfa.disabled', targetType: 'user', targetId: user.id, ip })
}
