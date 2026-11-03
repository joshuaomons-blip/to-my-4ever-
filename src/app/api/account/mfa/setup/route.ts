import { route } from '@/server/http'
import { beginMfaSetup } from '@/server/services/mfa'

export const POST = route({ auth: 'customer' }, async ({ user }) => beginMfaSetup(user))
