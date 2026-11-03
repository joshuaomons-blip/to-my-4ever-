import { route, ApiError } from '@/server/http'
import { prisma } from '@/server/db'
import { sweepDeposits, toDepositDTO } from '@/server/payments/service'

export const GET = route({ auth: 'customer' }, async ({ params, user }) => {
  await sweepDeposits(user.id)
  const d = await prisma.depositRequest.findFirst({ where: { id: params.id, userId: user.id } })
  if (!d) throw new ApiError(404, 'Deposit not found')
  return { deposit: toDepositDTO(d) }
})
