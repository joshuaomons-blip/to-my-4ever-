import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, RequireStepUp, StaffSessionGuard } from '../auth/guards';
import { hashPassword } from '../auth/password';
import { AuditService } from '../common/audit.service';
import { randomToken } from '../common/crypto';
import { AppError } from '../common/errors';
import { fromMinor } from '../common/money';
import { AppRequest, AuthContext } from '../common/request-context';
import { ControlsService } from '../compliance/controls.service';
import { DbService } from '../database/db.service';
import { LedgerService } from '../ledger/ledger.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { FundingService } from '../payments/funding.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import {
  AlertUpdateDto, BreakResolveDto, ControlDto, CreateStaffDto, DecisionDto, FeeScheduleDto, GateApprovalDto,
  JurisdictionUpdateDto, ReasonDto, RestrictionDto, ScreeningReviewDto, TicketReplyDto,
} from './admin.dto';
import { PermissionsGuard, RequirePermissions, permissionsFor } from './rbac';

const mask = (s: string | null | undefined, keep = 2) => (s ? `${s.slice(0, keep)}${'•'.repeat(Math.max(0, s.length - keep))}` : s);

@ApiTags('admin')
@Controller('v1/admin')
@UseGuards(StaffSessionGuard, PermissionsGuard)
export class AdminController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly onboarding: OnboardingService,
    private readonly funding: FundingService,
    private readonly recon: ReconciliationService,
    private readonly ledger: LedgerService,
    private readonly controls: ControlsService,
  ) {}

  private async hasPii(a: AuthContext) {
    return permissionsFor(a.roles).has('customers.pii');
  }

  // ---------- Overview ----------
  @Get('overview')
  @RequirePermissions('customers.read')
  async overview() {
    const one = async (sql: string) => Number((await this.db.one<{ n: string }>(sql))!.n);
    return {
      customers: await one('SELECT count(*)::text AS n FROM users'),
      pendingReviews: await one("SELECT count(*)::text AS n FROM onboarding_applications WHERE status = 'manual_review'"),
      withdrawalsPendingReview: await one("SELECT count(*)::text AS n FROM withdrawals WHERE status = 'pending_review'"),
      openAlerts: await one("SELECT count(*)::text AS n FROM monitoring_alerts WHERE status NOT LIKE 'closed_%'"),
      openBreaks: await one("SELECT count(*)::text AS n FROM reconciliation_breaks WHERE status <> 'resolved'"),
      openTickets: await one("SELECT count(*)::text AS n FROM support_tickets WHERE status NOT IN ('resolved','closed')"),
      openComplaints: await one("SELECT count(*)::text AS n FROM support_tickets WHERE is_complaint AND status NOT IN ('resolved','closed')"),
      deadJobs: await one("SELECT count(*)::text AS n FROM jobs WHERE status = 'dead'"),
      ordersToday: await one("SELECT count(*)::text AS n FROM orders WHERE created_at > current_date"),
      pendingLaunchGates: (await this.controls.pendingLaunchGates()).length,
    };
  }

  // ---------- Customers ----------
  @Get('customers')
  @RequirePermissions('customers.read')
  async customers(@Auth() a: AuthContext, @Query('q') q = '', @Query('status') status?: string) {
    const rows = await this.db.query<{ id: string; email: string; display_name: string; status: string; residence_country: string | null; created_at: Date; app_status: string | null; account_status: string | null }>(
      `SELECT u.id, u.email, u.display_name, u.status, u.residence_country, u.created_at, a.status AS app_status, b.status AS account_status
         FROM users u LEFT JOIN onboarding_applications a ON a.user_id = u.id LEFT JOIN brokerage_accounts b ON b.user_id = u.id
        WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%' OR u.display_name ILIKE '%' || $1 || '%' OR u.id::text = $1)
          AND ($2::text IS NULL OR a.status = $2)
        ORDER BY u.created_at DESC LIMIT 100`,
      [q.trim().slice(0, 100), status ?? null],
    );
    const pii = await this.hasPii(a);
    return rows.map((r) => ({ ...r, email: pii ? r.email : mask(r.email, 3) }));
  }

  @Get('customers/:id')
  @RequirePermissions('customers.read')
  async customer(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    const u = await this.db.one<Record<string, unknown>>('SELECT id, email, display_name, status, residence_country, mfa_enabled, email_verified_at, created_at FROM users WHERE id = $1', [id]);
    if (!u) throw new AppError('NOT_FOUND', 'Customer not found', 404);
    const pii = await this.hasPii(a);
    const p = await this.db.one<Record<string, unknown>>('SELECT * FROM customer_profiles WHERE user_id = $1', [id]);
    const [app, account, restrictions, screening, kyc, orders, alerts, deposits, withdrawals, tickets] = await Promise.all([
      this.db.one('SELECT * FROM onboarding_applications WHERE user_id = $1', [id]),
      this.db.one('SELECT * FROM brokerage_accounts WHERE user_id = $1', [id]),
      this.db.query('SELECT * FROM account_restrictions WHERE user_id = $1 ORDER BY created_at DESC', [id]),
      this.db.query('SELECT * FROM screening_results WHERE user_id = $1 ORDER BY screened_at DESC', [id]),
      this.db.query('SELECT k.* FROM kyc_checks k JOIN onboarding_applications a ON a.id = k.application_id WHERE a.user_id = $1', [id]),
      this.db.query('SELECT o.id, i.symbol, o.side, o.type, o.quantity, o.filled_quantity, o.status, o.created_at FROM orders o JOIN instruments i ON i.id = o.instrument_id WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT 50', [id]),
      this.db.query('SELECT * FROM monitoring_alerts WHERE user_id = $1 ORDER BY created_at DESC', [id]),
      this.db.query('SELECT id, amount_minor::text, currency, status, created_at FROM deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [id]),
      this.db.query('SELECT id, amount_minor::text, currency, status, requires_review, created_at FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [id]),
      this.db.query('SELECT id, reference, subject, status, is_complaint FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC', [id]),
    ]);
    const balances = await this.ledger.customerBalances(id, 'USD');
    await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'admin.customer_viewed', targetType: 'user', targetId: id, metadata: { pii }, req });
    const { tax_id_enc: _t, ...profile } = p ?? {};
    return {
      user: { ...u, email: pii ? u.email : mask(String(u.email), 3) },
      profile: p ? (pii ? profile : { residence_country: p.residence_country, nationality: p.nationality, legal_last_name: mask(String(p.legal_last_name ?? ''), 1) }) : null,
      application: app, brokerageAccount: account, restrictions, screening, kyc, orders, alerts, deposits, withdrawals, tickets,
      balances: { ...balances, minor: undefined },
    };
  }

  // ---------- Onboarding reviews ----------
  @Get('onboarding/reviews')
  @RequirePermissions('onboarding.review')
  reviews() {
    return this.db.query(
      `SELECT a.id, a.user_id, a.status, a.decision_reason, a.submitted_at, u.display_name, p.residence_country, p.nationality, p.is_politically_exposed,
              (SELECT count(*) FROM screening_results s WHERE s.user_id = a.user_id AND s.status = 'potential_match' AND s.reviewed_at IS NULL)::int AS open_screening_matches
         FROM onboarding_applications a JOIN users u ON u.id = a.user_id LEFT JOIN customer_profiles p ON p.user_id = a.user_id
        WHERE a.status = 'manual_review' ORDER BY a.submitted_at`,
    );
  }

  @Post('onboarding/:id/decision')
  @HttpCode(200)
  @RequireStepUp()
  @RequirePermissions('onboarding.review')
  async decide(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto, @Req() req: AppRequest) {
    await this.onboarding.decide(a.subjectId, id, dto.decision, dto.reason, req);
    return { status: 'ok' };
  }

  @Post('screening/:id/review')
  @HttpCode(200)
  @RequireStepUp()
  @RequirePermissions('screening.review')
  async reviewScreening(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ScreeningReviewDto, @Req() req: AppRequest) {
    await this.db.tx(async (c) => {
      const r = await c.query<{ user_id: string }>(
        "UPDATE screening_results SET status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4 WHERE id = $1 AND status = 'potential_match' AND reviewed_at IS NULL RETURNING user_id",
        [id, dto.outcome, a.subjectId, dto.note],
      );
      if (!r.rows[0]) throw new AppError('INVALID_STATE', 'Screening result not pending review', 409);
      if (dto.outcome === 'confirmed_match') {
        await c.query("INSERT INTO account_restrictions (user_id, type, reason, created_by) VALUES ($1,'full_freeze',$2,$3)", [r.rows[0].user_id, `Confirmed screening match: ${dto.note}`, a.subjectId]);
      }
      await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'compliance.screening_reviewed', targetType: 'screening_result', targetId: id, metadata: { outcome: dto.outcome }, req }, c);
    });
    return { status: 'ok' };
  }

  // ---------- Restrictions ----------
  @Post('customers/:id/restrictions')
  @RequireStepUp()
  @RequirePermissions('restrictions.manage')
  async restrict(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RestrictionDto, @Req() req: AppRequest) {
    return this.db.tx(async (c) => {
      const r = (await c.query<{ id: string }>('INSERT INTO account_restrictions (user_id, type, reason, created_by) VALUES ($1,$2,$3,$4) RETURNING id', [id, dto.type, dto.reason, a.subjectId])).rows[0]!;
      await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'compliance.restriction_applied', targetType: 'user', targetId: id, metadata: { type: dto.type, reason: dto.reason }, req }, c);
      return r;
    });
  }

  @Post('restrictions/:id/lift')
  @HttpCode(200)
  @RequireStepUp()
  @RequirePermissions('restrictions.manage')
  async lift(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Req() req: AppRequest) {
    await this.db.tx(async (c) => {
      const r = await c.query<{ created_by: string | null; user_id: string }>('SELECT created_by, user_id FROM account_restrictions WHERE id = $1 AND lifted_at IS NULL FOR UPDATE', [id]);
      const row = r.rows[0];
      if (!row) throw new AppError('NOT_FOUND', 'Active restriction not found', 404);
      if (row.created_by === a.subjectId) throw new AppError('FOUR_EYES_REQUIRED', 'A different staff member must lift a restriction you applied', 403);
      await c.query('UPDATE account_restrictions SET lifted_at = now(), lifted_by = $2, lift_reason = $3 WHERE id = $1', [id, a.subjectId, dto.reason]);
      await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'compliance.restriction_lifted', targetType: 'user', targetId: row.user_id, metadata: { restrictionId: id, reason: dto.reason }, req }, c);
    });
    return { status: 'lifted' };
  }

  // ---------- Withdrawals ----------
  @Get('withdrawals')
  @RequirePermissions('withdrawals.review')
  withdrawals(@Query('status') status = 'pending_review') {
    return this.db.query(
      `SELECT w.id, w.user_id, u.display_name, w.amount_minor::text AS amount_minor, w.currency, w.status, w.requires_review, w.created_at, m.label AS method, m.last4
         FROM withdrawals w JOIN users u ON u.id = w.user_id JOIN payment_methods m ON m.id = w.payment_method_id
        WHERE w.status = $1 ORDER BY w.created_at`,
      [status],
    );
  }

  @Post('withdrawals/:id/decision')
  @HttpCode(200)
  @RequireStepUp()
  @RequirePermissions('withdrawals.review')
  async withdrawalDecision(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto, @Req() req: AppRequest) {
    await this.funding.reviewWithdrawal(a.subjectId, id, dto.decision, dto.reason, req);
    return { status: 'ok' };
  }

  // ---------- Transaction monitoring ----------
  @Get('alerts')
  @RequirePermissions('alerts.manage')
  alerts(@Query('status') status = 'open') {
    return this.db.query(
      `SELECT al.*, u.display_name FROM monitoring_alerts al JOIN users u ON u.id = al.user_id
        WHERE ($1 = 'all' OR ($1 = 'open' AND al.status NOT LIKE 'closed_%') OR al.status = $1)
        ORDER BY CASE al.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, al.created_at LIMIT 200`,
      [status],
    );
  }

  @Put('alerts/:id')
  @RequireStepUp()
  @RequirePermissions('alerts.manage')
  async updateAlert(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AlertUpdateDto, @Req() req: AppRequest) {
    const closing = dto.status.startsWith('closed_');
    if (closing && !dto.note) throw new AppError('VALIDATION_FAILED', 'A closure note is required', 400);
    if (dto.status === 'closed_reported' && !dto.externalFilingRef) throw new AppError('VALIDATION_FAILED', 'External filing reference required', 400);
    await this.db.tx(async (c) => {
      const r = await c.query(
        `UPDATE monitoring_alerts SET status = $2, assigned_to = COALESCE(assigned_to, $3),
                closed_by = CASE WHEN $4 THEN $3 END, closed_at = CASE WHEN $4 THEN now() END,
                closure_note = COALESCE($5, closure_note), external_filing_ref = COALESCE($6, external_filing_ref)
          WHERE id = $1 AND status NOT LIKE 'closed_%' RETURNING id`,
        [id, dto.status, a.subjectId, closing, dto.note ?? null, dto.externalFilingRef ?? null],
      );
      if (!r.rows.length) throw new AppError('INVALID_STATE', 'Alert not found or already closed', 409);
      await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'compliance.alert_updated', targetType: 'monitoring_alert', targetId: id, metadata: { status: dto.status }, req }, c);
    });
    return { status: 'ok' };
  }

  // ---------- Payments & reconciliation ----------
  @Get('payments/deposits')
  @RequirePermissions('payments.read')
  deposits(@Query('status') status?: string) {
    return this.db.query(
      `SELECT d.id, d.user_id, u.display_name, d.amount_minor::text AS amount_minor, d.currency, d.provider, d.provider_payment_id, d.status, d.failure_reason, d.created_at, d.settled_at
         FROM deposits d JOIN users u ON u.id = d.user_id WHERE ($1::text IS NULL OR d.status = $1) ORDER BY d.created_at DESC LIMIT 200`,
      [status ?? null],
    );
  }

  @Get('reconciliation')
  @RequirePermissions('reconciliation.manage')
  async reconciliation() {
    const [runs, breaks, tb] = await Promise.all([
      this.db.query('SELECT * FROM reconciliation_runs ORDER BY started_at DESC LIMIT 20'),
      this.db.query("SELECT b.*, u.display_name FROM reconciliation_breaks b LEFT JOIN users u ON u.id = b.user_id WHERE b.status <> 'resolved' ORDER BY b.created_at DESC LIMIT 200"),
      this.ledger.trialBalance(),
    ]);
    return { runs, breaks, trialBalance: tb };
  }

  @Post('reconciliation/run')
  @HttpCode(200)
  @RequirePermissions('reconciliation.manage')
  async runRecon(@Auth() a: AuthContext, @Req() req: AppRequest) {
    const r = await this.recon.run();
    await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'ops.reconciliation_run', targetType: 'reconciliation_run', targetId: r.runId, req });
    return r;
  }

  @Post('reconciliation/breaks/:id/resolve')
  @HttpCode(200)
  @RequireStepUp()
  @RequirePermissions('reconciliation.manage')
  async resolveBreak(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BreakResolveDto, @Req() req: AppRequest) {
    const r = await this.db.query("UPDATE reconciliation_breaks SET status = 'resolved', resolved_by = $2, resolved_at = now(), resolution_note = $3 WHERE id = $1 AND status <> 'resolved' RETURNING id", [id, a.subjectId, dto.note]);
    if (!r.length) throw new AppError('NOT_FOUND', 'Open break not found', 404);
    await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'ops.reconciliation_break_resolved', targetType: 'reconciliation_break', targetId: id, metadata: { note: dto.note }, req });
    return { status: 'resolved' };
  }

  // ---------- Support ----------
  @Get('support/tickets')
  @RequirePermissions('support.read')
  tickets(@Query('status') status = 'active') {
    return this.db.query(
      `SELECT t.*, u.display_name FROM support_tickets t JOIN users u ON u.id = t.user_id
        WHERE ($1 = 'all' OR ($1 = 'active' AND t.status NOT IN ('resolved','closed')) OR t.status = $1)
        ORDER BY t.is_complaint DESC, t.complaint_deadline NULLS LAST, t.updated_at DESC LIMIT 200`,
      [status],
    );
  }

  @Get('support/tickets/:id')
  @RequirePermissions('support.read')
  async ticket(@Param('id', ParseUUIDPipe) id: string) {
    const t = await this.db.one('SELECT t.*, u.display_name FROM support_tickets t JOIN users u ON u.id = t.user_id WHERE t.id = $1', [id]);
    if (!t) throw new AppError('NOT_FOUND', 'Ticket not found', 404);
    return { ...t, messages: await this.db.query('SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY id', [id]) };
  }

  @Post('support/tickets/:id/reply')
  @RequirePermissions('support.manage')
  async reply(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TicketReplyDto, @Req() req: AppRequest) {
    await this.db.tx(async (c) => {
      const t = (await c.query<{ user_id: string; reference: string }>('SELECT user_id, reference FROM support_tickets WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!t) throw new AppError('NOT_FOUND', 'Ticket not found', 404);
      await c.query("INSERT INTO ticket_messages (ticket_id, author_type, author_id, body, internal) VALUES ($1,'staff',$2,$3,$4)", [id, a.subjectId, dto.message, dto.internal]);
      await c.query('UPDATE support_tickets SET status = COALESCE($2, status), assigned_to = COALESCE(assigned_to, $3) WHERE id = $1', [id, dto.status ?? null, a.subjectId]);
      if (!dto.internal) {
        await c.query("INSERT INTO notifications (user_id, kind, title, body, data) VALUES ($1,'support',$2,$3,$4)", [t.user_id, `Reply on ${t.reference}`, dto.message.slice(0, 200), JSON.stringify({ ticketId: id })]);
      }
      await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'support.replied', targetType: 'support_ticket', targetId: id, metadata: { internal: dto.internal, status: dto.status }, req }, c);
    });
    return { status: 'ok' };
  }

  // ---------- Fees (maker-checker) ----------
  @Get('fees')
  @RequirePermissions('fees.manage')
  fees() {
    return this.db.query('SELECT f.*, f.commission_min_minor::text, f.commission_max_minor::text, f.deposit_fee_minor::text, f.withdrawal_fee_minor::text FROM fee_schedules f ORDER BY version DESC');
  }

  @Post('fees')
  @RequireStepUp()
  @RequirePermissions('fees.manage')
  async createFee(@Auth() a: AuthContext, @Body() dto: FeeScheduleDto, @Req() req: AppRequest) {
    return this.db.tx(async (c) => {
      const v = (await c.query<{ v: number }>('SELECT COALESCE(max(version), 0) + 1 AS v FROM fee_schedules')).rows[0]!.v;
      const r = (await c.query<{ id: string; version: number }>(
        `INSERT INTO fee_schedules (version, status, currency, commission_bps, commission_min_minor, commission_max_minor, fx_spread_bps, deposit_fee_minor, withdrawal_fee_minor, notes, created_by)
         VALUES ($1,'draft',$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, version`,
        [v, dto.currency, dto.commissionBps, dto.commissionMinMinor, dto.commissionMaxMinor ?? null, dto.fxSpreadBps, dto.depositFeeMinor, dto.withdrawalFeeMinor, dto.notes, a.subjectId],
      )).rows[0]!;
      await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'fees.draft_created', targetType: 'fee_schedule', targetId: r.id, metadata: { ...dto }, req }, c);
      return r;
    });
  }

  @Post('fees/:id/activate')
  @HttpCode(200)
  @RequireStepUp()
  @RequirePermissions('fees.manage')
  async activateFee(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    await this.db.tx(async (c) => {
      const f = (await c.query<{ created_by: string | null; status: string; currency: string }>('SELECT created_by, status, currency FROM fee_schedules WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!f) throw new AppError('NOT_FOUND', 'Fee schedule not found', 404);
      if (f.status !== 'draft') throw new AppError('INVALID_STATE', 'Only drafts can be activated', 409);
      if (f.created_by === a.subjectId) throw new AppError('FOUR_EYES_REQUIRED', 'A different staff member must approve this fee schedule', 403);
      await c.query("UPDATE fee_schedules SET status = 'retired' WHERE status = 'active' AND currency = $1", [f.currency]);
      await c.query("UPDATE fee_schedules SET status = 'active', approved_by = $2, activated_at = now() WHERE id = $1", [id, a.subjectId]);
      await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'fees.activated', targetType: 'fee_schedule', targetId: id, req }, c);
    });
    return { status: 'active', notice: 'Customers must be notified of fee changes per the notice periods in your terms.' };
  }

  // ---------- Platform controls & jurisdictions ----------
  @Get('controls')
  @RequirePermissions('system.read')
  controlsList() {
    return this.db.query('SELECT * FROM platform_controls ORDER BY key');
  }

  @Put('controls/:key')
  @RequireStepUp()
  @RequirePermissions('controls.manage')
  async setControl(@Auth() a: AuthContext, @Param('key') key: string, @Body() dto: ControlDto, @Req() req: AppRequest) {
    const r = await this.db.query('UPDATE platform_controls SET enabled = $2, reason = $3, updated_by = $4, updated_at = now() WHERE key = $1 RETURNING key', [key, dto.enabled, dto.reason, a.subjectId]);
    if (!r.length) throw new AppError('NOT_FOUND', 'Unknown control', 404);
    this.controls.invalidate();
    await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'ops.control_changed', targetType: 'platform_control', targetId: key, metadata: { enabled: dto.enabled, reason: dto.reason }, req });
    return { key, enabled: dto.enabled };
  }

  @Get('jurisdictions')
  @RequirePermissions('customers.read')
  jurisdictions() {
    return this.db.query('SELECT * FROM jurisdictions ORDER BY region, name');
  }

  @Put('jurisdictions/:code')
  @RequireStepUp()
  @RequirePermissions('jurisdictions.manage')
  async updateJurisdiction(@Auth() a: AuthContext, @Param('code') code: string, @Body() dto: JurisdictionUpdateDto, @Req() req: AppRequest) {
    const j = await this.db.one<{ region: string }>('SELECT region FROM jurisdictions WHERE code = $1', [code]);
    if (!j) throw new AppError('NOT_FOUND', 'Unknown jurisdiction', 404);
    if (j.region === 'sanctioned' && dto.status !== 'blocked') throw new AppError('SANCTIONED_JURISDICTION', 'Sanctioned jurisdictions cannot be enabled from the admin console', 403);
    await this.db.tx(async (c) => {
      await c.query(
        `UPDATE jurisdictions SET status = $2, onboarding_enabled = $3, trading_enabled = $4, deposits_enabled = $5, withdrawals_enabled = $6,
                legal_review_ref = COALESCE($7, legal_review_ref), updated_by = $8 WHERE code = $1`,
        [code, dto.status, dto.onboardingEnabled, dto.tradingEnabled, dto.depositsEnabled, dto.withdrawalsEnabled, dto.legalReviewRef ?? null, a.subjectId],
      ).catch((e: { code?: string; constraint?: string }) => {
        if (e.code === '23514') throw new AppError('INVALID_JURISDICTION_CONFIG', `Configuration rejected (${e.constraint})`, 422);
        throw e;
      });
      await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'compliance.jurisdiction_updated', targetType: 'jurisdiction', targetId: code, metadata: { ...dto }, req }, c);
    });
    return { status: 'ok' };
  }

  // ---------- Launch gates ----------
  @Get('launch-gates')
  @RequirePermissions('system.read')
  gates() {
    return this.db.query(
      `SELECT g.*, COALESCE(json_agg(json_build_object('staffId', a.staff_id, 'name', s.display_name, 'evidenceRef', a.evidence_ref, 'approvedAt', a.approved_at))
                FILTER (WHERE a.staff_id IS NOT NULL), '[]') AS approvals
         FROM launch_gates g LEFT JOIN launch_gate_approvals a ON a.gate_key = g.key LEFT JOIN staff_users s ON s.id = a.staff_id
        GROUP BY g.key ORDER BY g.category, g.key`,
    );
  }

  @Post('launch-gates/:key/approve')
  @HttpCode(200)
  @RequireStepUp()
  @RequirePermissions('launch_gates.approve')
  async approveGate(@Auth() a: AuthContext, @Param('key') key: string, @Body() dto: GateApprovalDto, @Req() req: AppRequest) {
    await this.db.query('INSERT INTO launch_gate_approvals (gate_key, staff_id, evidence_ref) VALUES ($1,$2,$3)', [key, a.subjectId, dto.evidenceRef]).catch((e: { code?: string }) => {
      if (e.code === '23505') throw new AppError('ALREADY_APPROVED', 'You have already approved this gate; a different approver is required', 409);
      if (e.code === '23503') throw new AppError('NOT_FOUND', 'Unknown gate', 404);
      throw e;
    });
    await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'launch_gate.approved', targetType: 'launch_gate', targetId: key, metadata: { evidenceRef: dto.evidenceRef }, req });
    return { pending: await this.controls.pendingLaunchGates() };
  }

  // ---------- Audit ----------
  @Get('audit')
  @RequirePermissions('audit.read')
  auditLog(@Query('targetId') targetId?: string, @Query('actorId') actorId?: string, @Query('action') action?: string, @Query('before') before?: string) {
    return this.db.query(
      `SELECT id::text, occurred_at, actor_type, actor_id, action, target_type, target_id, outcome, host(ip) AS ip, request_id, metadata
         FROM audit_log WHERE ($1::text IS NULL OR target_id = $1) AND ($2::text IS NULL OR actor_id = $2)
          AND ($3::text IS NULL OR action LIKE $3 || '%') AND ($4::bigint IS NULL OR id < $4)
        ORDER BY id DESC LIMIT 200`,
      [targetId ?? null, actorId ?? null, action ?? null, before ?? null],
    );
  }

  @Get('audit/verify')
  @RequirePermissions('audit.read')
  async verifyChain() {
    const r = await this.db.one<{ total: string; broken: string; first_broken: string | null }>(
      `WITH c AS (
         SELECT id, hash, prev_hash, lag(hash) OVER (ORDER BY id) AS expected_prev,
                digest(coalesce(encode(lag(hash) OVER (ORDER BY id), 'hex'), '') || '|' || audit_ts(occurred_at) || '|' || actor_type || '|' ||
                       coalesce(actor_id, '') || '|' || action || '|' || coalesce(target_type, '') || '|' || coalesce(target_id, '') || '|' ||
                       outcome || '|' || metadata::text, 'sha256') AS recomputed
           FROM audit_log)
       SELECT count(*)::text AS total,
              count(*) FILTER (WHERE hash <> recomputed OR prev_hash IS DISTINCT FROM expected_prev)::text AS broken,
              min(id) FILTER (WHERE hash <> recomputed OR prev_hash IS DISTINCT FROM expected_prev)::text AS first_broken
         FROM c`,
    );
    return { entries: Number(r!.total), intact: r!.broken === '0', firstBrokenId: r!.first_broken };
  }

  // ---------- System health ----------
  @Get('system')
  @RequirePermissions('system.read')
  async system() {
    const [jobs, dead, webhooks, sessions] = await Promise.all([
      this.db.query("SELECT queue, status, count(*)::int AS n FROM jobs WHERE created_at > now() - interval '7 days' GROUP BY queue, status ORDER BY queue"),
      this.db.query("SELECT id::text, queue, attempts, last_error, created_at FROM jobs WHERE status = 'dead' ORDER BY id DESC LIMIT 50"),
      this.db.query("SELECT provider, count(*) FILTER (WHERE processed_at IS NULL)::int AS unprocessed, count(*) FILTER (WHERE processing_error IS NOT NULL)::int AS errored FROM webhook_events GROUP BY provider"),
      this.db.query("SELECT subject_type, count(*)::int AS n FROM sessions WHERE revoked_at IS NULL AND idle_expires_at > now() GROUP BY subject_type"),
    ]);
    return { jobs, deadJobs: dead, webhooks, activeSessions: sessions, trialBalance: await this.ledger.trialBalance(), pendingLaunchGates: await this.controls.pendingLaunchGates() };
  }

  @Post('system/jobs/:id/retry')
  @HttpCode(200)
  @RequireStepUp()
  @RequirePermissions('controls.manage')
  async retryJob(@Auth() a: AuthContext, @Param('id') id: string, @Req() req: AppRequest) {
    const r = await this.db.query("UPDATE jobs SET status = 'pending', attempts = 0, run_at = now() WHERE id = $1 AND status = 'dead' RETURNING id", [id]);
    if (!r.length) throw new AppError('NOT_FOUND', 'Dead job not found', 404);
    await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'ops.job_retried', targetType: 'job', targetId: id, req });
    return { status: 'requeued' };
  }

  // ---------- Compliance reporting ----------
  @Get('reports/compliance')
  @RequirePermissions('reports.read')
  async complianceReport(@Query('from') from?: string, @Query('to') to?: string) {
    const f = from ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const t = to ?? new Date().toISOString().slice(0, 10);
    const q = (sql: string) => this.db.query(sql, [f, t]);
    return {
      period: { from: f, to: t },
      applicationsByStatus: await q("SELECT status, count(*)::int AS n FROM onboarding_applications WHERE created_at::date BETWEEN $1 AND $2 GROUP BY status"),
      applicationsByCountry: await q("SELECT p.residence_country, a.status, count(*)::int AS n FROM onboarding_applications a JOIN customer_profiles p ON p.user_id = a.user_id WHERE a.created_at::date BETWEEN $1 AND $2 GROUP BY 1,2 ORDER BY 1"),
      screening: await q("SELECT status, count(*)::int AS n FROM screening_results WHERE screened_at::date BETWEEN $1 AND $2 GROUP BY status"),
      alerts: await q("SELECT rule, severity, status, count(*)::int AS n FROM monitoring_alerts WHERE created_at::date BETWEEN $1 AND $2 GROUP BY 1,2,3"),
      complaints: await q("SELECT status, count(*)::int AS n, count(*) FILTER (WHERE complaint_deadline < now() AND status NOT IN ('resolved','closed'))::int AS overdue FROM support_tickets WHERE is_complaint AND created_at::date BETWEEN $1 AND $2 GROUP BY status"),
      restrictions: await q("SELECT type, count(*)::int AS applied, count(lifted_at)::int AS lifted FROM account_restrictions WHERE created_at::date BETWEEN $1 AND $2 GROUP BY type"),
      fundsFlow: (await q(
        `SELECT 'deposits' AS kind, currency, sum(amount_minor)::text AS total_minor, count(*)::int AS n FROM deposits WHERE status = 'settled' AND settled_at::date BETWEEN $1 AND $2 GROUP BY currency
         UNION ALL SELECT 'withdrawals', currency, sum(amount_minor)::text, count(*)::int FROM withdrawals WHERE status = 'completed' AND completed_at::date BETWEEN $1 AND $2 GROUP BY currency`,
      )).map((r) => ({ ...r, total: fromMinor(BigInt((r as { total_minor: string }).total_minor), (r as { currency: string }).currency) })),
      notice: 'Operational summary only. Regulatory reports (e.g. SAR/STR, transaction reporting, tax reporting) must be prepared per jurisdiction by qualified staff and, where applicable, by the brokerage partner.',
    };
  }

  // ---------- Staff management ----------
  @Get('staff')
  @RequirePermissions('staff.manage')
  staff() {
    return this.db.query("SELECT s.id, s.email, s.display_name, s.status, s.mfa_enabled, COALESCE(array_agg(r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles FROM staff_users s LEFT JOIN staff_roles r ON r.staff_id = s.id GROUP BY s.id ORDER BY s.created_at");
  }

  @Post('staff')
  @RequireStepUp()
  @RequirePermissions('staff.manage')
  async createStaff(@Auth() a: AuthContext, @Body() dto: CreateStaffDto, @Req() req: AppRequest) {
    const temp = randomToken(18);
    const hash = await hashPassword(temp);
    const s = await this.db.tx(async (c) => {
      const row = (await c.query<{ id: string }>('INSERT INTO staff_users (email, password_hash, display_name) VALUES ($1,$2,$3) RETURNING id', [dto.email.toLowerCase(), hash, dto.displayName])).rows[0]!;
      for (const role of dto.roles) await c.query('INSERT INTO staff_roles (staff_id, role, granted_by) VALUES ($1,$2,$3)', [row.id, role, a.subjectId]);
      await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'staff.created', targetType: 'staff', targetId: row.id, metadata: { roles: dto.roles }, req }, c);
      return row;
    });
    return { id: s.id, temporaryPassword: temp, notice: 'Deliver via a secure out-of-band channel. The user must enrol MFA at first login.' };
  }

  @Post('staff/:id/disable')
  @HttpCode(200)
  @RequireStepUp()
  @RequirePermissions('staff.manage')
  async disableStaff(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    if (id === a.subjectId) throw new AppError('INVALID_OPERATION', 'You cannot disable your own account', 409);
    await this.db.tx(async (c) => {
      await c.query("UPDATE staff_users SET status = 'disabled' WHERE id = $1", [id]);
      await c.query("UPDATE sessions SET revoked_at = now(), revoke_reason = 'staff_disabled' WHERE subject_type = 'staff' AND subject_id = $1 AND revoked_at IS NULL", [id]);
      await this.audit.record({ actorType: 'staff', actorId: a.subjectId, action: 'staff.disabled', targetType: 'staff', targetId: id, req }, c);
    });
    return { status: 'disabled' };
  }
}
