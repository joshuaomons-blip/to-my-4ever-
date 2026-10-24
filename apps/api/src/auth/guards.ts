import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APP_CONFIG, AppConfig } from '../config/config';
import { AppError } from '../common/errors';
import { AppRequest, AuthContext } from '../common/request-context';

const ALLOW_MFA_PENDING = 'allow_mfa_pending';
const REQUIRE_STEP_UP = 'require_step_up';

/** Allows a session that passed password auth but not yet MFA (only for MFA verification endpoints). */
export const AllowMfaPending = () => SetMetadata(ALLOW_MFA_PENDING, true);
/** Requires a fresh MFA re-verification within the step-up window (withdrawals, security changes, admin actions). */
export const RequireStepUp = () => SetMetadata(REQUIRE_STEP_UP, true);

export const Auth = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.auth) throw new AppError('UNAUTHENTICATED', 'Authentication required', 401);
  return req.auth;
});

export function assertStepUp(auth: AuthContext, windowSeconds: number): void {
  if (!auth.stepUpAt || Date.now() - auth.stepUpAt.getTime() > windowSeconds * 1000) {
    throw new AppError('STEP_UP_REQUIRED', 'Please re-confirm with your authenticator code to continue', 403);
  }
}

abstract class BaseSessionGuard implements CanActivate {
  protected abstract subject: 'customer' | 'staff';
  constructor(protected readonly reflector: Reflector, @Inject(APP_CONFIG) protected readonly cfg: AppConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AppRequest & { csrfFailed?: boolean }>();
    if (req.csrfFailed) throw new AppError('CSRF_FAILED', 'Missing or invalid CSRF token', 403);
    const auth = req.auth;
    if (!auth || auth.subjectType !== this.subject) throw new AppError('UNAUTHENTICATED', 'Authentication required', 401);
    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_MFA_PENDING, [ctx.getHandler(), ctx.getClass()]);
    if (!auth.mfaVerified && !allowPending) {
      throw new AppError('MFA_REQUIRED', 'Multi-factor verification required', 401);
    }
    if (this.reflector.getAllAndOverride<boolean>(REQUIRE_STEP_UP, [ctx.getHandler(), ctx.getClass()])) {
      assertStepUp(auth, this.cfg.stepUpWindowSeconds);
    }
    return true;
  }
}

@Injectable()
export class CustomerGuard extends BaseSessionGuard {
  protected subject = 'customer' as const;
}

@Injectable()
export class StaffSessionGuard extends BaseSessionGuard {
  protected subject = 'staff' as const;
}
