import { z } from 'zod'
import { route } from '@/server/http'
import { prisma } from '@/server/db'
import { getSessionId } from '@/server/auth/session'
import { audit } from '@/server/audit'

export const DELETE = route(
  { auth: 'customer', schema: z.object({ sessionId: z.string().max(40).optional(), allOthers: z.boolean().optional() }) },
  async ({ body, user, ip }) => {
    const current = await getSessionId('customer')
    if (body.allOthers) await prisma.session.deleteMany({ where: { userId: user.id, id: { not: current ?? '' } } })
    else if (body.sessionId) await prisma.session.deleteMany({ where: { userId: user.id, id: body.sessionId } })
    await audit({ actor: user, action: 'sessions.revoked', targetType: 'user', targetId: user.id, ip })
    return { ok: true }
  },
)
