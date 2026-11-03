import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'

export async function audit(entry: {
  actor?: { id: string; email: string } | null
  action: string
  targetType?: string
  targetId?: string
  metadata?: Prisma.InputJsonValue
  ip?: string | null
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actor?.id ?? null,
        actorEmail: entry.actor?.email ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata,
        ip: entry.ip ?? null,
      },
    })
  } catch (err) {
    console.error('[audit] failed to write', entry.action, err)
  }
}
