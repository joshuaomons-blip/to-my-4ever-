import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, CustomerGuard } from '../auth/guards';
import { AppError } from '../common/errors';
import { fromMinor } from '../common/money';
import { AuthContext } from '../common/request-context';
import { DbService } from '../database/db.service';

const KIND_LABEL: Record<string, string> = {
  deposit_pending: 'Deposit pending', deposit_settled: 'Deposit', deposit_failed: 'Deposit failed',
  order_hold: 'Order reserve', order_hold_release: 'Reserve released', trade_buy: 'Buy', trade_sell: 'Sell',
  settlement: 'Settlement', withdrawal_hold: 'Withdrawal requested', withdrawal_release: 'Withdrawal returned',
  withdrawal_debited: 'Withdrawal', broker_activity_dividend: 'Dividend', broker_activity_dividend_tax_withheld: 'Dividend tax withheld',
  broker_activity_interest: 'Interest', broker_activity_fee: 'Partner fee', reversal: 'Correction (reversal)',
};

@ApiTags('activity')
@Controller('v1')
@UseGuards(CustomerGuard)
export class ActivityController {
  constructor(private readonly db: DbService) {}

  @Get('activity')
  @ApiOperation({ summary: 'Cash activity from the platform ledger, newest first' })
  async activity(@Auth() a: AuthContext, @Query('before') before?: string, @Query('limit') limit = '50') {
    const rows = await this.db.query<{ id: string; kind: string; description: string; created_at: Date; reference_type: string | null; reference_id: string | null; currency: string; available: string; pending: string; held: string; unsettled: string }>(
      `SELECT j.id, j.kind, j.description, j.created_at, j.reference_type, j.reference_id, p.currency,
              -sum(p.amount_minor) FILTER (WHERE la.type = 'customer_available')::text AS available,
              -sum(p.amount_minor) FILTER (WHERE la.type = 'customer_pending')::text AS pending,
              -sum(p.amount_minor) FILTER (WHERE la.type = 'customer_held')::text AS held,
              -sum(p.amount_minor) FILTER (WHERE la.type = 'customer_unsettled')::text AS unsettled
         FROM journal_entries j
         JOIN ledger_postings p ON p.journal_entry_id = j.id
         JOIN ledger_accounts la ON la.id = p.ledger_account_id
        WHERE la.owner_user_id = $1 AND ($2::timestamptz IS NULL OR j.created_at < $2)
        GROUP BY j.id, p.currency ORDER BY j.created_at DESC LIMIT $3`,
      [a.subjectId, before ?? null, Math.min(Number(limit) || 50, 200)],
    );
    const f = (v: string | null, c: string) => (v === null ? null : fromMinor(BigInt(v), c));
    return rows.map((r) => ({
      id: r.id, type: r.kind, label: KIND_LABEL[r.kind] ?? r.kind, description: r.description, at: r.created_at,
      reference: r.reference_type ? { type: r.reference_type, id: r.reference_id } : null, currency: r.currency,
      changes: { available: f(r.available, r.currency), pending: f(r.pending, r.currency), held: f(r.held, r.currency), unsettled: f(r.unsettled, r.currency) },
    }));
  }

  @Get('documents')
  @ApiOperation({ summary: 'Statements, confirmations and tax forms issued by the brokerage partner' })
  documents(@Auth() a: AuthContext) {
    return this.db.query(
      `SELECT id, kind, title, period_start AS "periodStart", period_end AS "periodEnd", provider, created_at AS "createdAt"
         FROM documents WHERE user_id = $1 ORDER BY COALESCE(period_end, created_at::date) DESC, created_at DESC`,
      [a.subjectId],
    );
  }

  @Get('documents/:id/download')
  async download(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    const d = await this.db.one<{ provider: string; provider_document_id: string }>('SELECT provider, provider_document_id FROM documents WHERE id = $1 AND user_id = $2', [id, a.subjectId]);
    if (!d) throw new AppError('NOT_FOUND', 'Document not found', 404);
    // Production: proxy a short-lived signed download from the partner's documents API (never cache PDFs in public storage).
    throw new AppError('DOCUMENT_DOWNLOAD_NOT_CONFIGURED', `Document download from ${d.provider} is available once the partner documents API is connected.`, 501);
  }

  @Get('dividends')
  dividends(@Auth() a: AuthContext) {
    return this.db.query(
      `SELECT aa.id, aa.type, aa.amount_minor::text AS "amountMinor", aa.currency, aa.description, aa.occurred_at AS "occurredAt", i.symbol
         FROM account_activities aa JOIN brokerage_accounts b ON b.id = aa.brokerage_account_id LEFT JOIN instruments i ON i.id = aa.instrument_id
        WHERE b.user_id = $1 AND aa.type IN ('dividend','dividend_tax_withheld','corporate_action') ORDER BY aa.occurred_at DESC LIMIT 200`,
      [a.subjectId],
    );
  }

  @Get('notifications')
  notifications(@Auth() a: AuthContext) {
    return this.db.query(
      'SELECT id, kind, title, body, data, read_at AS "readAt", created_at AS "createdAt" FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [a.subjectId],
    );
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  async readAll(@Auth() a: AuthContext) {
    await this.db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [a.subjectId]);
  }
}
