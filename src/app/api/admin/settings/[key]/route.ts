import { z } from 'zod'
import { route, ApiError } from '@/server/http'
import { saveSetting, settingsSchemas, type SettingsKey } from '@/server/settings'
import { audit } from '@/server/audit'
import type { Permission } from '@/server/auth/permissions'
import { getCurrentUser } from '@/server/auth/session'
import { can } from '@/server/auth/permissions'

// Content keys are editable with content:manage; platform keys need settings:manage.
const CONTENT_KEYS: SettingsKey[] = ['homepage', 'support', 'investmentInfo', 'maintenance']

export const PUT = route(
  { auth: 'admin', schema: z.object({ value: z.unknown() }), maxBodyBytes: 400_000 },
  async ({ params, body, user, ip }) => {
    const key = params.key as SettingsKey
    if (!(key in settingsSchemas)) throw new ApiError(404, 'Unknown setting')
    const needed: Permission = CONTENT_KEYS.includes(key) ? 'content:manage' : 'settings:manage'
    const fresh = await getCurrentUser('admin')
    if (!fresh || !can(fresh, needed)) throw new ApiError(403, 'You do not have permission to change this setting')
    const parsed = settingsSchemas[key].safeParse(body.value)
    if (!parsed.success) {
      const fields: Record<string, string> = {}
      for (const i of parsed.error.issues) fields[i.path.join('.')] ??= i.message
      throw new ApiError(422, Object.values(fields)[0] ?? 'Invalid value', fields)
    }
    await saveSetting(key, parsed.data as never)
    const meta = key === 'branding' ? { ...(parsed.data as object), logoDataUrl: (parsed.data as { logoDataUrl: string }).logoDataUrl ? '[image]' : '' } : parsed.data
    await audit({ actor: user, action: `settings.${key}.updated`, targetType: 'setting', targetId: key, metadata: meta as object, ip })
    return { ok: true }
  },
)
