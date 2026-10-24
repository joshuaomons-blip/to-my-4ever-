import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { APP_CONFIG, AppConfig } from '../config/config';
import { AuditService } from '../common/audit.service';
import { AppError } from '../common/errors';
import { RateLimit } from '../common/rate-limit';
import { AppRequest, AuthContext } from '../common/request-context';
import { DbService } from '../database/db.service';
import {
  ChangePasswordDto, EmailDto, LoginDto, MfaCodeDto, RegisterDto, ResetPasswordDto, StrictMfaCodeDto, TokenDto,
} from './auth.dto';
import { AuthService, toPublicUser } from './auth.service';
import { AllowMfaPending, Auth, CustomerGuard, RequireStepUp } from './guards';
import { MfaService } from './mfa.service';
import { SessionService } from './session.service';

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
    private readonly db: DbService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  @Post('register')
  @HttpCode(202)
  @RateLimit({ name: 'register', limit: 5, windowSeconds: 3600, failClosed: true })
  @ApiOperation({ summary: 'Register. Always returns 202 to avoid revealing whether an email exists.' })
  async register(@Body() dto: RegisterDto, @Req() req: AppRequest) {
    await this.auth.register(dto, req);
    return { status: 'verification_email_sent' };
  }

  @Post('verify-email')
  @HttpCode(200)
  @RateLimit({ name: 'verify-email', limit: 20, windowSeconds: 3600 })
  async verifyEmail(@Body() dto: TokenDto, @Req() req: AppRequest) {
    await this.auth.verifyEmail(dto.token, req);
    return { status: 'verified' };
  }

  @Post('resend-verification')
  @HttpCode(202)
  @RateLimit({ name: 'resend-verification', limit: 3, windowSeconds: 3600, by: 'ip+body:email', failClosed: true })
  async resend(@Body() dto: EmailDto) {
    await this.auth.resendVerification(dto.email);
    return { status: 'accepted' };
  }

  @Post('login')
  @HttpCode(200)
  @RateLimit(
    { name: 'login-ip', limit: 30, windowSeconds: 900, failClosed: true },
    { name: 'login-account', limit: 10, windowSeconds: 900, by: 'ip+body:email', failClosed: true },
  )
  async login(@Body() dto: LoginDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { session, user, mfaRequired } = await this.auth.login(dto.email, dto.password, req);
    this.sessions.setCookies(res, 'customer', session.token, session.csrfToken);
    return { user, mfaRequired, csrfToken: session.csrfToken };
  }

  @Post('mfa/verify')
  @HttpCode(200)
  @UseGuards(CustomerGuard)
  @AllowMfaPending()
  @RateLimit({ name: 'mfa-verify', limit: 10, windowSeconds: 900, by: 'subject', failClosed: true })
  async verifyMfa(@Auth() a: AuthContext, @Body() dto: MfaCodeDto, @Req() req: AppRequest) {
    let ok = false;
    if (dto.code) ok = await this.mfa.verify('users', a.subjectId, dto.code);
    else if (dto.recoveryCode) ok = await this.mfa.useRecoveryCode(a.subjectId, dto.recoveryCode);
    await this.audit.record({
      actorType: 'customer', actorId: a.subjectId, action: 'auth.mfa_verify', outcome: ok ? 'success' : 'failure',
      metadata: { method: dto.code ? 'totp' : 'recovery_code' }, req,
    });
    if (!ok) throw new AppError('INVALID_MFA_CODE', 'The code is incorrect or expired', 400);
    await this.sessions.markMfaVerified(a.sessionId);
    return { status: 'verified' };
  }

  @Post('step-up')
  @HttpCode(200)
  @UseGuards(CustomerGuard)
  @RateLimit({ name: 'step-up', limit: 10, windowSeconds: 900, by: 'subject', failClosed: true })
  @ApiOperation({ summary: 'Re-confirm MFA before a sensitive action (valid for STEP_UP_WINDOW_SECONDS)' })
  async stepUp(@Auth() a: AuthContext, @Body() dto: StrictMfaCodeDto, @Req() req: AppRequest) {
    const ok = await this.mfa.verify('users', a.subjectId, dto.code);
    await this.audit.record({ actorType: 'customer', actorId: a.subjectId, action: 'auth.step_up', outcome: ok ? 'success' : 'failure', req });
    if (!ok) throw new AppError('INVALID_MFA_CODE', 'The code is incorrect or expired', 400);
    await this.sessions.markStepUp(a.sessionId);
    return { status: 'ok', validForSeconds: this.cfg.stepUpWindowSeconds };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(CustomerGuard)
  @AllowMfaPending()
  async logout(@Auth() a: AuthContext, @Res({ passthrough: true }) res: Response, @Req() req: AppRequest) {
    await this.sessions.revoke(a.sessionId, 'logout');
    this.sessions.clearCookies(res, 'customer');
    await this.audit.record({ actorType: 'customer', actorId: a.subjectId, action: 'auth.logout', req });
    return { status: 'logged_out' };
  }

  @Get('session')
  @ApiCookieAuth()
  @UseGuards(CustomerGuard)
  @AllowMfaPending()
  async session(@Auth() a: AuthContext) {
    const u = await this.auth.getUser(a.subjectId);
    return { user: toPublicUser(u), mfaVerified: a.mfaVerified, operatingMode: this.cfg.operatingMode };
  }

  @Post('password/forgot')
  @HttpCode(202)
  @RateLimit({ name: 'forgot', limit: 5, windowSeconds: 3600, by: 'ip+body:email', failClosed: true })
  async forgot(@Body() dto: EmailDto) {
    await this.auth.forgotPassword(dto.email);
    return { status: 'accepted' };
  }

  @Post('password/reset')
  @HttpCode(200)
  @RateLimit({ name: 'reset', limit: 10, windowSeconds: 3600, failClosed: true })
  async reset(@Body() dto: ResetPasswordDto, @Req() req: AppRequest) {
    await this.auth.resetPassword(dto.token, dto.password, req);
    return { status: 'password_reset' };
  }

  @Post('password/change')
  @HttpCode(200)
  @UseGuards(CustomerGuard)
  @RateLimit({ name: 'change-password', limit: 5, windowSeconds: 900, by: 'subject', failClosed: true })
  async changePassword(@Auth() a: AuthContext, @Body() dto: ChangePasswordDto, @Req() req: AppRequest) {
    await this.auth.changePassword(a.subjectId, a.sessionId, dto.currentPassword, dto.newPassword, req);
    return { status: 'password_changed' };
  }

  @Post('mfa/setup')
  @HttpCode(200)
  @UseGuards(CustomerGuard)
  async mfaSetup(@Auth() a: AuthContext) {
    const u = await this.auth.getUser(a.subjectId);
    if (u.mfa_enabled) throw new AppError('MFA_ALREADY_ENABLED', 'MFA is already enabled', 409);
    return this.mfa.beginSetup('users', u.id, u.email);
  }

  @Post('mfa/enable')
  @HttpCode(200)
  @UseGuards(CustomerGuard)
  @RateLimit({ name: 'mfa-enable', limit: 10, windowSeconds: 900, by: 'subject' })
  async mfaEnable(@Auth() a: AuthContext, @Body() dto: StrictMfaCodeDto, @Req() req: AppRequest) {
    const recoveryCodes = await this.mfa.confirmSetup('users', a.subjectId, dto.code);
    await this.sessions.markMfaVerified(a.sessionId);
    await this.db.query('UPDATE sessions SET mfa_required = true WHERE id = $1', [a.sessionId]);
    await this.audit.record({ actorType: 'customer', actorId: a.subjectId, action: 'auth.mfa_enabled', targetType: 'user', targetId: a.subjectId, req });
    return { recoveryCodes, note: 'Store these recovery codes securely. Each can be used once.' };
  }

  @Post('mfa/disable')
  @HttpCode(200)
  @UseGuards(CustomerGuard)
  @RequireStepUp()
  async mfaDisable(@Auth() a: AuthContext, @Req() req: AppRequest) {
    const app = await this.db.one<{ status: string }>('SELECT status FROM onboarding_applications WHERE user_id = $1', [a.subjectId]);
    if (app && app.status !== 'draft') {
      throw new AppError('MFA_MANDATORY', 'MFA is mandatory for brokerage customers and cannot be disabled', 409);
    }
    await this.mfa.disable(a.subjectId);
    await this.audit.record({ actorType: 'customer', actorId: a.subjectId, action: 'auth.mfa_disabled', req });
    return { status: 'disabled' };
  }

  @Get('sessions')
  @UseGuards(CustomerGuard)
  async listSessions(@Auth() a: AuthContext) {
    const rows = await this.db.query<{ id: string; created_at: Date; last_seen_at: Date; ip: string | null; user_agent: string | null }>(
      `SELECT id, created_at, last_seen_at, host(ip) AS ip, user_agent FROM sessions
        WHERE subject_type = 'customer' AND subject_id = $1 AND revoked_at IS NULL AND absolute_expires_at > now()
        ORDER BY last_seen_at DESC`,
      [a.subjectId],
    );
    return rows.map((r) => ({ id: r.id, createdAt: r.created_at, lastSeenAt: r.last_seen_at, ip: r.ip, userAgent: r.user_agent, current: r.id === a.sessionId }));
  }

  @Delete('sessions/:id')
  @UseGuards(CustomerGuard)
  async revokeSession(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    const r = await this.db.query(
      `UPDATE sessions SET revoked_at = now(), revoke_reason = 'user_revoked'
        WHERE id = $1 AND subject_type = 'customer' AND subject_id = $2 AND revoked_at IS NULL RETURNING id`,
      [id, a.subjectId],
    );
    if (!r.length) throw new AppError('NOT_FOUND', 'Session not found', 404);
    await this.audit.record({ actorType: 'customer', actorId: a.subjectId, action: 'auth.session_revoked', targetType: 'session', targetId: id, req });
    return { status: 'revoked' };
  }
}
