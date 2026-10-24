'use client';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: Record<string, unknown>) {
    super(message);
  }
}

function csrf(): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|;\s*)(?:__Host-)?aur_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : '';
}

export const newIdempotencyKey = () => crypto.randomUUID();

type StepUpHandler = () => Promise<boolean>;
let stepUpHandler: StepUpHandler | null = null;
/** Registered by <StepUpProvider>; called when the API demands a fresh MFA confirmation. */
export const registerStepUp = (h: StepUpHandler | null) => (stepUpHandler = h);

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string; retryOnStepUp?: boolean } = {}): Promise<T> {
  const method = init.method ?? (init.body !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf();
  if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey;
  const res = await fetch(`/api${path}`, { method, headers, credentials: 'same-origin', body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (json as { error?: { code: string; message: string; details?: Record<string, unknown> } }).error;
    const err = new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? 'Request failed', e?.details);
    if (err.code === 'STEP_UP_REQUIRED' && init.retryOnStepUp !== false && stepUpHandler) {
      // Same idempotency key on retry → the server can never double-execute.
      if (await stepUpHandler()) return api<T>(path, { ...init, retryOnStepUp: false });
    }
    throw err;
  }
  return json as T;
}
