import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export interface AuthContext {
  sessionId: string;
  subjectType: 'customer' | 'staff';
  subjectId: string;
  mfaRequired: boolean;
  mfaVerified: boolean;
  stepUpAt: Date | null;
  roles: string[];
}

export interface AppRequest extends Request {
  requestId: string;
  auth?: AuthContext;
  rawBody?: Buffer;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  (req as AppRequest).requestId = id;
  res.setHeader('x-request-id', id);
  next();
}

export function clientMeta(req: AppRequest): { ip: string | null; userAgent: string | null; requestId: string } {
  return { ip: req.ip ?? null, userAgent: req.header('user-agent')?.slice(0, 400) ?? null, requestId: req.requestId };
}
