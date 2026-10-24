import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { LoginDto, StrictMfaCodeDto } from '../auth/auth.dto';
import { AllowMfaPending, Auth, StaffSessionGuard } from '../auth/guards';
import { MfaService } from '../auth/mfa.service';
import { DUMMY_HASH_PROMISE, verifyPassword } from '../auth/password';
import { SessionService } from '../auth/session.service';
import { AuditService } from '../common/audit.service';
import { AppError } from '../common/errors';
import { RateLimit } from '../common/rate-limit';
import { AppRequest, AuthContext } from '../common/request-context';
import { DbService } from '../database/db.service';
import { permissionsFor } from './rbac';

@ApiTags('admin-auth')
@Controller('v1/admin/auth')
export class AdminAuthController {
  constructor(
    private readonly db: DbService,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @RateLimit(
    { name: 'staff-login-ip', limit: 10, windowSeconds: 900, failClosed: true },
    { name: 'staff-login-acct', limit: 5, windowSeconds: 900, by: 'ip+body:email', failClosed: true },
  )
  async login(@Body() dto: LoginDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const s = await this.db.one<{ id: string; password_hash: string; status: string; mfa_enabled: boolean; locked_until: Date | null; failed_login_count: number }>(
      'SELECT id, password_hash, status, mfa_enabled, locked_until, failed_login_count FROM staff_users WHERE email = $1',
      [dto.email.trim().toLowerCase()],
    );
    const ok = s ? await verifyPassword(s.password_hash, dto.password) : await verifyPassword(await DUMMY_HASH_PROMISE, dto.password).then(() => false);
    if (!s || !ok || s.status !== 'active' || (s.locked_until && s.locked_until > new Date())) {
      if (s && !ok) {
        await this.db.query(
          `UPDATE staff_users SET failed_login_count = failed_login_count + 1,
                  locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN now() + interval '30 minutes' ELSE locked_until END WHERE id = $1`,
          [s.id],
        );
      }
      await this.audit.record({ actorType: s ? 'staff' : 'anonymous', actorId: s?.id, action: 'admin.login', outcome: 'failure', req });
      throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials', 401);
    }
    await this.db.query('UPDATE staff_users SET failed_login_count = 0, locked_until = NULL WHERE id = $1', [s.id]);
    // Staff MFA is mandatory: every staff session starts MFA-pending.
    const session = await this.sessions.create(this.db.pool, 'staff', s.id, true, req);
    this.sessions.setCookies(res, 'staff', session.token, session.csrfToken);
    await this.audit.record({ actorType: 'staff', actorId: s.id, action: 'admin.login', req });
    return { mfaEnrolled: s.mfa_enabled, csrfToken: session.csrfToken };
  }

  @Post('mfa/setup')
  @HttpCode(200)
  @UseGuards(StaffSessionGuard)
  @AllowMfaPending()
  async setup(@Auth() a: AuthContext) {
    const s = await this.db.one<{ email: string; mfa_enabled: boolean }>('SELECT email, mfa_enabled FROM staff_users WHERE id = $1', [a.subjectId]);
    if (s!.mfa_enabled) throw new AppError('MFA_ALREADY_ENABLED', 'MFA already enrolled', 409);
    return this.mfa.beginSetup('staff_users', a.subjectId, s!.email);
  }

  @Post('mfa/enable')
  @HttpCode(200)
  @UseGuards(StaffSessionGuard)
  @AllowMfaPending()
  async enable(@Auth() a: AuthContext, @Body() dto: StrictMfaCodeDto, @Req() req: AppRequest) {
    await this.mfa.confirmSetup('staff_users', a.subjectId, dto.code);
    await this.sessions.markMfaVerified(a.sessionId);
    await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'admin.mfa_enrolled', req });
    return { status: 'enabled' };
  }

  @Post('mfa/verify')
  @HttpCode(200)
  @UseGuards(StaffSessionGuard)
  @AllowMfaPending()
  @RateLimit({ name: 'staff-mfa', limit: 5, windowSeconds: 900, by: 'subject', failClosed: true })
  async verify(@Auth() a: AuthContext, @Body() dto: StrictMfaCodeDto, @Req() req: AppRequest) {
    const ok = await this.mfa.verify('staff_users', a.subjectId, dto.code);
    await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'admin.mfa_verify', outcome: ok ? 'success' : 'failure', req });
    if (!ok) throw new AppError('INVALID_MFA_CODE', 'Invalid code', 400);
    await this.sessions.markMfaVerified(a.sessionId);
    return { status: 'verified' };
  }

  @Post('step-up')
  @HttpCode(200)
  @UseGuards(StaffSessionGuard)
  @RateLimit({ name: 'staff-step-up', limit: 10, windowSeconds: 900, by: 'subject', failClosed: true })
  async stepUp(@Auth() a: AuthContext, @Body() dto: StrictMfaCodeDto, @Req() req: AppRequest) {
    const ok = await this.mfa.verify('staff_users', a.subjectId, dto.code);
    await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'admin.step_up', outcome: ok ? 'success' : 'failure', req });
    if (!ok) throw new AppError('INVALID_MFA_CODE', 'Invalid code', 400);
    await this.sessions.markStepUp(a.sessionId);
    return { status: 'ok' };
  }

  @Get('me')
  @UseGuards(StaffSessionGuard)
  @AllowMfaPending()
  async me(@Auth() a: AuthContext) {
    const s = await this.db.one<{ id: string; email: string; display_name: string; mfa_enabled: boolean; roles: string[] }>(
      "SELECT s.id, s.email, s.display_name, s.mfa_enabled, COALESCE(array_agg(r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles FROM staff_users s LEFT JOIN staff_roles r ON r.staff_id = s.id WHERE s.id = $1 GROUP BY s.id",
      [a.subjectId],
    );
    return { ...s, mfaVerified: a.mfaVerified, stepUpAt: a.stepUpAt, permissions: [...permissionsFor(s?.roles ?? [])] };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(StaffSessionGuard)
  @AllowMfaPending()
  async logout(@Auth() a: AuthContext, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(a.sessionId, 'logout');
    this.sessions.clearCookies(res, 'staff');
    return { status: 'logged_out' };
  }
}
