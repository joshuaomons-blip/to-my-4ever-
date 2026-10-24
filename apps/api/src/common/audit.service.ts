import { Injectable } from '@nestjs/common';
import { DbService, Queryable } from '../database/db.service';
import { AppRequest, clientMeta } from './request-context';

export interface AuditEntry {
  actorType: 'customer' | 'staff' | 'system' | 'provider' | 'anonymous';
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  outcome?: 'success' | 'failure' | 'denied';
  metadata?: Record<string, unknown>;
  req?: AppRequest;
}

const REDACT = /password|secret|token|code|tax_?id|ssn|card/i;

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Copies metadata with secrets redacted. Null-prototype output + key filter prevent prototype pollution. */
export function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  for (const [k, v] of Object.entries(meta)) {
    if (UNSAFE_KEYS.has(k)) continue;
    if (REDACT.test(k)) out[k] = '[REDACTED]';
    else if (typeof v === 'bigint') out[k] = v.toString();
    else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = redact(v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

/** Writes to the append-only, hash-chained audit_log. Pass a transaction client to make it atomic with the change. */
@Injectable()
export class AuditService {
  constructor(private readonly db: DbService) {}

  async record(e: AuditEntry, client?: Queryable): Promise<void> {
    const meta = e.req ? clientMeta(e.req) : { ip: null, userAgent: null, requestId: null };
    const q = client ?? this.db.pool;
    await q.query(
      `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, outcome, ip, user_agent, request_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        e.actorType,
        e.actorId ?? null,
        e.action,
        e.targetType ?? null,
        e.targetId ?? null,
        e.outcome ?? 'success',
        meta.ip,
        meta.userAgent,
        meta.requestId,
        JSON.stringify(redact(e.metadata ?? {})),
      ],
    );
  }
}
