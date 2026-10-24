import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/** Domain error with a stable machine-readable code. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = HttpStatus.UNPROCESSABLE_ENTITY,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} not found`, 404);
export const forbidden = (msg = 'Forbidden', code = 'FORBIDDEN') => new AppError(code, msg, 403);
export const conflict = (code: string, msg: string) => new AppError(code, msg, 409);
export const unauthorized = (msg = 'Authentication required', code = 'UNAUTHENTICATED') => new AppError(code, msg, 401);

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId;
    let status = 500;
    let body: { code: string; message: string; details?: unknown } = {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    };

    if (exception instanceof AppError) {
      status = exception.status;
      body = { code: exception.code, message: exception.message, details: exception.details };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse() as string | { message?: string | string[]; error?: string };
      const message = typeof r === 'string' ? r : Array.isArray(r.message) ? r.message.join('; ') : r.message ?? exception.message;
      body = { code: status === 400 ? 'VALIDATION_FAILED' : status === 429 ? 'RATE_LIMITED' : `HTTP_${status}`, message };
    } else {
      const pg = exception as { code?: string; message?: string; constraint?: string };
      if (pg.code === 'P0002' || pg.message?.startsWith('insufficient_funds')) {
        status = 422;
        body = { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient available funds for this action' };
      } else if (pg.code === '23505') {
        status = 409;
        body = { code: 'DUPLICATE', message: 'A conflicting record already exists' };
      } else {
        this.logger.error({ requestId, err: exception instanceof Error ? exception.stack : exception });
      }
    }
    res.status(status).json({ error: { ...body, requestId } });
  }
}
