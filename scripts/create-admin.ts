/**
 * Create the first SUPER_ADMIN from environment variables (no hardcoded credentials):
 *   ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='a-long-Unique-passphrase-1' npm run admin:create
 * Refuses if a super admin already exists.
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, scrypt } from 'node:crypto'

const prisma = new PrismaClient()

function hash(password: string) {
  const salt = randomBytes(16)
  return new Promise<string>((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(['scrypt', 2 ** 15, 8, 1, salt.toString('base64url'), key.toString('base64url')].join('$')),
    ),
  )
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD ?? ''
  if (!email || !/.+@.+\..+/.test(email)) throw new Error('Set ADMIN_EMAIL to a valid email address')
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password))
    throw new Error('ADMIN_PASSWORD must be 12+ characters with upper, lower case and a number')
  if (await prisma.user.count({ where: { role: 'SUPER_ADMIN' } })) throw new Error('A super admin already exists. Manage admins from the dashboard.')
  if (await prisma.user.findUnique({ where: { email } })) throw new Error('That email is already registered')
  const user = await prisma.user.create({
    data: { email, firstName: 'Platform', lastName: 'Owner', role: 'SUPER_ADMIN', passwordHash: await hash(password), emailVerifiedAt: new Date() },
  })
  await prisma.auditLog.create({ data: { actorId: user.id, actorEmail: email, action: 'admin.setup_completed', targetType: 'user', targetId: user.id, metadata: { via: 'cli' } } })
  console.log(`✔ Super admin created: ${email}. Sign in at /admin/login and enable two-factor authentication.`)
}

main()
  .catch((e) => {
    console.error('✖', e.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
