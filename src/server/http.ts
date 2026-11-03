import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { z, type ZodType } from 'zod'
import { Prisma } from '@prisma/client'
import { clientInfo, getCurrentUser, type SafeUser } from '@/server/auth/session'
import { can, type Permission } from '@/server/auth/permissions'
import { rateLimit } from '@/server/security/rateLimit'
import { getSettings } from '@/server/settings'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message)
  }
}

type RouteOptions<S extends ZodType | undefined> = {
  auth: 'none' | 'customer' | 'admin'
  permission?: Permission
  /** Admin endpoints that must work before MFA setup is complete. */
  allowMfaSetup?: boolean
  schema?: S
  rateLimit?: { name: string; limit: number; windowSeconds: number }
  maxBodyBytes?: number
}

type HandlerCtx<S, U> = {
  req: NextRequest
  params: Record<string, string>
  body: S extends ZodType ? z.infer<S> : undefined
  user: U
  ip: string
}

type UserFor<A> = A extends 'none' ? SafeUser | null : SafeUser

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (!origin) return true // same-origin fetches from older browsers / server tools
  try {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function route<S extends ZodType | undefined = undefined, A extends RouteOptions<S>['auth'] = 'none'>(
  opts: RouteOptions<S> & { auth: A },
  handler: (ctx: HandlerCtx<S, UserFor<A>>) => Promise<unknown>,
) {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    try {
      const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      if (mutating) {
        if (!sameOrigin(req)) throw new ApiError(403, 'Cross-origin request blocked')
        const ct = req.headers.get('content-type') ?? ''
        if (opts.schema && !ct.includes('application/json')) throw new ApiError(415, 'Expected JSON')
      }
      const { ip } = await clientInfo()

      if (opts.rateLimit) {
        const ok = await rateLimit(`${opts.rateLimit.name}:${ip}`, opts.rateLimit.limit, opts.rateLimit.windowSeconds)
        if (!ok) throw new ApiError(429, 'Too many requests. Please wait a moment and try again.')
      }

      let user: SafeUser | null = null
      if (opts.auth !== 'none') {
        user = await getCurrentUser(opts.auth)
        if (!user) throw new ApiError(401, 'Authentication required')
        if (opts.auth === 'admin') {
          if (!opts.allowMfaSetup && !user.totpEnabled && (await getSettings()).security.requireAdminMfa) {
            throw new ApiError(403, 'Two-factor authentication must be enabled first')
          }
          if (opts.permission && !can(user, opts.permission)) throw new ApiError(403, 'You do not have permission for this action')
        }
        if (mutating) {
          const ok = await rateLimit(`api:${user.id}`, 120, 60)
          if (!ok) throw new ApiError(429, 'Too many requests. Please slow down.')
        }
      }

      let body: unknown = undefined
      if (opts.schema) {
        const len = Number(req.headers.get('content-length') ?? 0)
        if (len > (opts.maxBodyBytes ?? 64_000)) throw new ApiError(413, 'Request too large')
        const text = await req.text()
        if (text.length > (opts.maxBodyBytes ?? 64_000)) throw new ApiError(413, 'Request too large')
        let json: unknown
        try {
          json = text ? JSON.parse(text) : {}
        } catch {
          throw new ApiError(400, 'Invalid JSON')
        }
        const parsed = opts.schema.safeParse(json)
        if (!parsed.success) {
          const fields: Record<string, string> = {}
          for (const issue of parsed.error.issues) {
            const key = issue.path.join('.') || '_'
            fields[key] ??= issue.message
          }
          throw new ApiError(422, Object.values(fields)[0] ?? 'Invalid input', fields)
        }
        body = parsed.data
      }

      const params = (await context?.params) ?? {}
      const result = await handler({ req, params, body, user, ip } as HandlerCtx<S, UserFor<A>>)
      if (result instanceof Response) return result
      return NextResponse.json(result ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message, fields: err.fields }, { status: err.status })
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      console.error('[api]', req.method, req.nextUrl.pathname, err)
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
    }
  }
}
