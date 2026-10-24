import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config';
import { AuditService } from '../common/audit.service';
import { decryptField } from '../common/crypto';
import { AppError } from '../common/errors';
import { Decimal, roundToMinor } from '../common/money';
import { DbService } from '../database/db.service';
import { JobsService } from '../jobs/jobs.service';
import { LedgerService, cr, dr } from '../ledger/ledger.service';
import { NotificationService } from '../notifications/mailer.service';
import { BROKER_ADAPTER, BrokerAdapter, BrokerError } from './broker-adapter';

export interface BrokerageAccountRow {
  id: string;
  user_id: string;
  provider: string;
  provider_account_id: string | null;
  account_number: string | null;
  status: string;
  currency: string;
  last_synced_at: Date | null;
}

@Injectable()
export class BrokerageService {
  private readonly logger = new Logger('Brokerage');

  constructor(
    private readonly db: DbService,
    @Inject(BROKER_ADAPTER) readonly adapter: BrokerAdapter,
    private readonly jobs: JobsService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  async accountForUser(userId: string): Promise<BrokerageAccountRow | undefined> {
    return this.db.one<BrokerageAccountRow>('SELECT * FROM brokerage_accounts WHERE user_id = $1 AND provider = $2', [userId, this.adapter.name]);
  }

  async requireActiveAccount(userId: string): Promise<BrokerageAccountRow & { provider_account_id: string }> {
    const a = await this.accountForUser(userId);
    if (!a || a.status !== 'active' || !a.provider_account_id) {
      throw new AppError('BROKERAGE_ACCOUNT_NOT_ACTIVE', 'Your brokerage account is not active yet', 409);
    }
    return a as BrokerageAccountRow & { provider_account_id: string };
  }

  /** Job: open the customer's account with the licensed partner after onboarding approval. */
  async openAccount(userId: string): Promise<void> {
    const p = await this.db.one<Record<string, string | boolean | Date | null>>(
      `SELECT p.*, u.email, u.base_currency, a.submitted_at FROM customer_profiles p
         JOIN users u ON u.id = p.user_id JOIN onboarding_applications a ON a.user_id = p.user_id
        WHERE p.user_id = $1 AND a.status = 'approved'`,
      [userId],
    );
    if (!p) throw new Error(`user ${userId} has no approved application`);
    const ip = (await this.db.one<{ ip: string | null }>(
      "SELECT host(ip) AS ip FROM disclosure_acceptances WHERE user_id = $1 AND document_key = 'partner_customer_agreement' ORDER BY accepted_at DESC LIMIT 1",
      [userId],
    ))?.ip ?? '0.0.0.0';
    await this.db.query(
      `INSERT INTO brokerage_accounts (user_id, provider, currency, status) VALUES ($1,$2,'USD','pending')
       ON CONFLICT (user_id, provider) DO NOTHING`,
      [userId, this.adapter.name],
    );
    const existing = (await this.accountForUser(userId))!;
    if (existing.provider_account_id) return; // already opened (idempotent job)
    const taxId = p.tax_id_enc ? decryptField(this.cfg.encryptionKey, String(p.tax_id_enc), `tax:${userId}`) : undefined;
    const acct = await this.adapter.openAccount({
      platformUserId: userId,
      email: String(p.email),
      phone: String(p.phone ?? ''),
      givenName: String(p.legal_first_name),
      familyName: String(p.legal_last_name),
      dateOfBirth: (p.date_of_birth as Date).toISOString().slice(0, 10),
      taxId,
      taxCountry: String(p.residence_country),
      citizenship: String(p.nationality),
      address: {
        line1: String(p.address_line1), line2: p.address_line2 as string | null, city: String(p.city),
        region: p.region as string | null, postalCode: String(p.postal_code), country: String(p.residence_country),
      },
      fundingSource: String(p.funding_source ?? 'employment_income'),
      disclosures: {
        isControlPerson: !!p.is_control_person,
        isAffiliatedExchange: !!p.is_affiliated_exchange,
        isPoliticallyExposed: !!p.is_politically_exposed,
      },
      agreementsSignedAt: (p.submitted_at as Date).toISOString(),
      ipAddress: ip,
      currency: 'USD',
    });
    await this.db.tx(async (c) => {
      await c.query(
        `UPDATE brokerage_accounts SET provider_account_id = $2, account_number = $3, status = $4,
                opened_at = CASE WHEN $4 = 'active' THEN now() END WHERE id = $1`,
        [existing.id, acct.providerAccountId, acct.accountNumber, acct.status],
      );
      await this.audit.record({ actorType: 'system', action: 'brokerage.account_opened', targetType: 'brokerage_account', targetId: existing.id, metadata: { provider: this.adapter.name, status: acct.status } }, c);
      if (acct.status === 'active') {
        await this.notifications.notify(userId, 'account', 'Your brokerage account is open', `Account ${acct.accountNumber ?? ''} is ready. You can now fund it and start investing.`, {}, c);
      } else {
        await this.jobs.enqueue(c, 'brokerage.sync_account', { brokerageAccountId: existing.id }, { delaySeconds: 30, dedupeKey: `sync:${existing.id}` });
      }
    });
  }

  /** Job: pull authoritative status, balances, positions, activities and documents from the partner. */
  async syncAccount(brokerageAccountId: string): Promise<void> {
    const a = await this.db.one<BrokerageAccountRow>('SELECT * FROM brokerage_accounts WHERE id = $1', [brokerageAccountId]);
    if (!a?.provider_account_id) return;
    const pid = a.provider_account_id;
    const acct = await this.adapter.getAccount(pid);
    if (acct.status !== a.status) {
      await this.db.query(
        "UPDATE brokerage_accounts SET status = $2, opened_at = COALESCE(opened_at, CASE WHEN $2 = 'active' THEN now() END) WHERE id = $1",
        [a.id, acct.status],
      );
      await this.audit.record({ actorType: 'provider', actorId: this.adapter.name, action: 'brokerage.account_status_changed', targetType: 'brokerage_account', targetId: a.id, metadata: { from: a.status, to: acct.status } });
    }
    if (acct.status !== 'active' && acct.status !== 'restricted') return;

    const [bal, positions, activities, documents] = await Promise.all([
      this.adapter.getBalances(pid),
      this.adapter.getPositions(pid),
      this.adapter.listActivities(pid, a.last_synced_at ? new Date(a.last_synced_at.getTime() - 86_400_000) : new Date(0)),
      this.adapter.listDocuments(pid),
    ]);

    await this.db.tx(async (c) => {
      await c.query(
        'INSERT INTO broker_account_snapshots (brokerage_account_id, cash, buying_power, equity, currency, as_of, raw) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [a.id, bal.cash, bal.buyingPower, bal.equity, bal.currency, bal.asOf, JSON.stringify(bal.raw ?? {})],
      );
      await c.query('DELETE FROM positions WHERE brokerage_account_id = $1', [a.id]);
      for (const p of positions) {
        const inst = (await c.query<{ id: string }>('SELECT id FROM instruments WHERE symbol = $1 ORDER BY exchange LIMIT 1', [p.symbol])).rows[0];
        if (!inst) {
          this.logger.warn(`position in unknown instrument ${p.symbol} for account ${a.id}`);
          continue;
        }
        await c.query(
          `INSERT INTO positions (brokerage_account_id, instrument_id, quantity, avg_entry_price, cost_basis, as_of) VALUES ($1,$2,$3,$4,$5,$6)`,
          [a.id, inst.id, p.quantity, p.avgEntryPrice, p.costBasis, bal.asOf],
        );
      }
      for (const act of activities) {
        const inst = act.symbol ? (await c.query<{ id: string }>('SELECT id FROM instruments WHERE symbol = $1 LIMIT 1', [act.symbol])).rows[0] : undefined;
        const amountMinor = roundToMinor(new Decimal(act.amount), bal.currency, Decimal.ROUND_HALF_EVEN);
        const ins = await c.query<{ id: string }>(
          `INSERT INTO account_activities (brokerage_account_id, provider, provider_activity_id, type, amount_minor, currency, instrument_id, description, occurred_at, raw)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (provider, provider_activity_id) DO NOTHING RETURNING id`,
          [a.id, this.adapter.name, act.providerActivityId, act.type, amountMinor.toString(), bal.currency, inst?.id ?? null, act.description, act.occurredAt, JSON.stringify(act)],
        );
        if (!ins.rows[0] || amountMinor === 0n || act.type === 'journal') continue;
        // Mirror partner-reported cash activity in the platform ledger.
        const cust = { owner: a.user_id, type: 'customer_available' as const, currency: bal.currency };
        const broker = { type: 'broker_settlement' as const, currency: bal.currency };
        const abs = amountMinor < 0n ? -amountMinor : amountMinor;
        await this.ledger.post(c, {
          idempotencyKey: `activity:${this.adapter.name}:${act.providerActivityId}`,
          kind: `broker_activity_${act.type}`,
          description: act.description,
          referenceType: 'account_activity',
          referenceId: ins.rows[0].id,
          createdBy: { type: 'provider', id: this.adapter.name },
          legs: amountMinor > 0n ? [dr(broker, abs), cr(cust, abs)] : [dr(cust, abs), cr(broker, abs)],
        });
        if (act.type === 'dividend') {
          await this.notifications.notify(a.user_id, 'dividend', 'Dividend received', act.description, { amount: act.amount }, c);
        }
      }
      for (const d of documents) {
        await c.query(
          `INSERT INTO documents (user_id, kind, title, period_start, period_end, provider, provider_document_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (provider, provider_document_id) DO NOTHING`,
          [a.user_id, d.kind, d.title, d.periodStart ?? null, d.periodEnd ?? null, this.adapter.name, d.providerDocumentId],
        );
      }
      await c.query('UPDATE brokerage_accounts SET last_synced_at = now() WHERE id = $1', [a.id]);
    });
  }

  async latestSnapshot(brokerageAccountId: string) {
    return this.db.one<{ cash: string; buying_power: string; equity: string; currency: string; as_of: Date }>(
      'SELECT cash, buying_power, equity, currency, as_of FROM broker_account_snapshots WHERE brokerage_account_id = $1 ORDER BY as_of DESC, id DESC LIMIT 1',
      [brokerageAccountId],
    );
  }

  /** Live buying power from the partner, falling back to the last snapshot when the partner is unavailable. */
  async buyingPower(a: BrokerageAccountRow & { provider_account_id: string }): Promise<{ buyingPower: string; asOf: string; live: boolean }> {
    try {
      const b = await this.adapter.getBalances(a.provider_account_id);
      return { buyingPower: b.buyingPower, asOf: b.asOf, live: true };
    } catch (e) {
      if (e instanceof BrokerError && e.retryable) {
        const s = await this.latestSnapshot(a.id);
        if (s) return { buyingPower: s.buying_power, asOf: s.as_of.toISOString(), live: false };
      }
      throw new AppError('BROKER_UNAVAILABLE', 'Our brokerage partner is temporarily unavailable. Please try again shortly.', 503);
    }
  }
}
