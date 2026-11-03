import 'server-only'
import { prisma } from '@/server/db'
import { ApiError } from '@/server/http'
import { audit } from '@/server/audit'
import { makeReference } from '@/server/security/crypto'
import type { SafeUser } from '@/server/auth/session'

export { TICKET_CATEGORIES } from '@/lib/validation'

export async function openTicket(user: SafeUser, input: { subject: string; category: string; message: string }, ip: string) {
  const open = await prisma.supportTicket.count({ where: { userId: user.id, status: { not: 'CLOSED' } } })
  if (open >= 10) throw new ApiError(429, 'You have 10 open requests. Close one before opening another.')
  const t = await prisma.supportTicket.create({
    data: {
      reference: makeReference('SUP'),
      userId: user.id,
      subject: input.subject,
      category: input.category,
      messages: { create: { authorId: user.id, body: input.message } },
    },
  })
  await audit({ actor: user, action: 'support.opened', targetType: 'ticket', targetId: t.id, metadata: { reference: t.reference }, ip })
  return t
}

export async function replyToTicket(author: SafeUser, ticketId: string, body: string, staff: boolean, ip: string) {
  const t = await prisma.supportTicket.findUnique({ where: { id: ticketId } })
  if (!t || (!staff && t.userId !== author.id)) throw new ApiError(404, 'Support request not found')
  if (t.status === 'CLOSED' && !staff) throw new ApiError(409, 'This request is closed. Open a new one if you still need help.')
  await prisma.$transaction([
    prisma.supportMessage.create({ data: { ticketId, authorId: author.id, fromStaff: staff, body } }),
    prisma.supportTicket.update({ where: { id: ticketId }, data: { status: staff ? 'ANSWERED' : 'OPEN' } }),
    ...(staff
      ? [prisma.notification.create({ data: { userId: t.userId, title: 'Support replied', body: `New reply on “${t.subject}” (${t.reference}).`, level: 'info' } })]
      : []),
  ])
  await audit({ actor: author, action: staff ? 'support.answered' : 'support.customer_reply', targetType: 'ticket', targetId: ticketId, ip })
}

export async function setTicketStatus(actor: SafeUser, ticketId: string, status: 'OPEN' | 'CLOSED', staff: boolean, ip: string) {
  const t = await prisma.supportTicket.findUnique({ where: { id: ticketId } })
  if (!t || (!staff && t.userId !== actor.id)) throw new ApiError(404, 'Support request not found')
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { status } })
  await audit({ actor, action: status === 'CLOSED' ? 'support.closed' : 'support.reopened', targetType: 'ticket', targetId: ticketId, ip })
}
