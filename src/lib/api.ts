'use client'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; fields?: Record<string, string>; status: number }

export async function api<T = { ok: true }>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json.error ?? `Request failed (${res.status})`, fields: json.fields, status: res.status }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, error: 'Network error. Check your connection and try again.', status: 0 }
  }
}
