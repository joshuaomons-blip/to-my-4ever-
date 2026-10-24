'use client';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: Record<string, unknown>) {
    super(message);
  }
}

function csrf(): string {
  const m = document.cookie.match(/(?:^|;\s*)(?:__Host-)?aur_staff_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : '';
}

let stepUp: (() => Promise<boolean>) | null = null;
export const registerStepUp = (h: typeof stepUp) => void (stepUp = h);

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; retry?: boolean } = {}): Promise<T> {
  const method = init.method ?? (init.body !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf();
  const res = await fetch(`/api/v1/admin${path}`, { method, headers, credentials: 'same-origin', body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (json as { error?: { code: string; message: string; details?: Record<string, unknown> } }).error;
    const err = new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? 'Request failed', e?.details);
    if (err.code === 'STEP_UP_REQUIRED' && init.retry !== false && stepUp && (await stepUp())) return api<T>(path, { ...init, retry: false });
    throw err;
  }
  return json as T;
}
