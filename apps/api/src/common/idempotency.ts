import {
  CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { DbService } from '../database/db.service';
import { sha256Hex } from './crypto';
import { AppError } from './errors';
import { AppRequest } from './request-context';

const IDEMPOTENT_KEY = 'idempotent_scope';
/** Require an Idempotency-Key header; repeated keys replay the original response. */
export const Idempotent = (scope: string) => SetMetadata(IDEMPOTENT_KEY, scope);

const stableJson = (v: unknown): string =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );

export function idempotencyKeyFrom(req: AppRequest): string {
  const key = req.header('idempotency-key');
  if (!key || !/^[\w-]{8,128}$/.test(key)) {
    throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header (8-128 chars) is required', 400);
  }
  return key;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector, private readonly db: DbService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const scope = this.reflector.get<string>(IDEMPOTENT_KEY, ctx.getHandler());
    if (!scope) return next.handle();
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const subjectId = req.auth?.subjectId;
    if (!subjectId) throw new AppError('UNAUTHENTICATED', 'Authentication required', 401);
    const key = idempotencyKeyFrom(req);
    const hash = sha256Hex(stableJson({ path: req.path, body: req.body ?? {} }));

    const inserted = await this.db.query(
      `INSERT INTO idempotency_records (subject_id, scope, key, request_hash, status)
       VALUES ($1,$2,$3,$4,'in_progress') ON CONFLICT DO NOTHING RETURNING key`,
      [subjectId, scope, key, hash],
    );
    if (inserted.length === 0) {
      const existing = await this.db.one<{ request_hash: string; status: string; response_code: number; response_body: unknown }>(
        'SELECT request_hash, status, response_code, response_body FROM idempotency_records WHERE subject_id=$1 AND scope=$2 AND key=$3',
        [subjectId, scope, key],
      );
      if (!existing) throw new AppError('REQUEST_IN_PROGRESS', 'Request is being processed', 409);
      if (existing.request_hash !== hash) {
        throw new AppError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was already used with a different request', 422);
      }
      if (existing.status !== 'completed') {
        throw new AppError('REQUEST_IN_PROGRESS', 'An identical request is still being processed', 409);
      }
      res.status(existing.response_code);
      res.setHeader('idempotent-replayed', 'true');
      return of(existing.response_body);
    }

    return next.handle().pipe(
      mergeMap((body) =>
        from(
          this.db
            .query(
              `UPDATE idempotency_records SET status='completed', response_code=$4, response_body=$5
               WHERE subject_id=$1 AND scope=$2 AND key=$3`,
              [subjectId, scope, key, res.statusCode, JSON.stringify(body ?? null)],
            )
            .then(() => body),
        ),
      ),
      catchError((err) =>
        from(
          this.db.query('DELETE FROM idempotency_records WHERE subject_id=$1 AND scope=$2 AND key=$3', [subjectId, scope, key]),
        ).pipe(mergeMap(() => throwError(() => err))),
      ),
    );
  }
}
