import { route } from '@/server/http'
import { beginMfaSetup } from '@/server/services/mfa'

export const POST = route({ auth: 'admin', allowMfaSetup: true }, async ({ user }) => beginMfaSetup(user))
