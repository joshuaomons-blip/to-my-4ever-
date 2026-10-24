import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { APP_CONFIG, AppConfig } from '../config/config';
import { Auth, CustomerGuard } from '../auth/guards';
import { Decimal } from '../common/money';
import { AuthContext } from '../common/request-context';
import { DbService } from '../database/db.service';
import { BrokerageService } from '../brokerage/brokerage.service';
import { LedgerService } from '../ledger/ledger.service';
import { MarketDataService } from '../market-data/market-data.service';

@ApiTags('portfolio')
@Controller('v1/portfolio')
@UseGuards(CustomerGuard)
export class PortfolioController {
  constructor(
    private readonly db: DbService,
    private readonly brokerage: BrokerageService,
    private readonly ledger: LedgerService,
    private readonly md: MarketDataService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Dashboard summary. Holdings and equity come from the partner; cash buckets from the platform ledger.' })
  async summary(@Auth() a: AuthContext) {
    const acct = await this.brokerage.accountForUser(a.subjectId);
    const currency = acct?.currency ?? 'USD';
    const cash = await this.ledger.customerBalances(a.subjectId, currency);
    const { minor: _m, ...cashOut } = cash;
    if (!acct || acct.status !== 'active' || !acct.provider_account_id) {
      return { operatingMode: this.cfg.operatingMode, account: acct ? { status: acct.status } : null, cash: cashOut, holdings: [], totals: null, buyingPower: null };
    }
    const positions = await this.db.query<{ symbol: string; name: string; asset_class: string; sector: string | null; quantity: string; avg_entry_price: string; cost_basis: string; as_of: Date }>(
      `SELECT i.symbol, i.name, i.asset_class, i.sector, p.quantity, p.avg_entry_price, p.cost_basis, p.as_of
         FROM positions p JOIN instruments i ON i.id = p.instrument_id WHERE p.brokerage_account_id = $1 AND p.quantity > 0 ORDER BY i.symbol`,
      [acct.id],
    );
    const quotes = await Promise.all(positions.map((p) => this.md.quote(p.symbol).catch(() => null)));
    let mv = new Decimal(0);
    let cost = new Decimal(0);
    let dayChange = new Decimal(0);
    const holdings = positions.map((p, i) => {
      const q = quotes[i];
      const qty = new Decimal(p.quantity);
      const price = q ? new Decimal(q.last) : new Decimal(p.avg_entry_price);
      const value = qty.mul(price);
      const basis = new Decimal(p.cost_basis);
      mv = mv.add(value);
      cost = cost.add(basis);
      if (q) dayChange = dayChange.add(qty.mul(new Decimal(q.last).sub(q.previousClose)));
      return {
        symbol: p.symbol, name: p.name, assetClass: p.asset_class, sector: p.sector,
        quantity: qty.toString(), avgEntryPrice: new Decimal(p.avg_entry_price).toFixed(4),
        lastPrice: price.toFixed(2), marketValue: value.toFixed(2), costBasis: basis.toFixed(2),
        unrealizedPl: value.sub(basis).toFixed(2), unrealizedPlPct: basis.gt(0) ? value.sub(basis).div(basis).mul(100).toFixed(2) : '0.00',
        priceAsOf: q?.asOf ?? null, priceStale: q?.stale ?? true, positionAsOf: p.as_of,
      };
    });
    const allocation = holdings.map((h) => ({ symbol: h.symbol, assetClass: h.assetClass, weightPct: mv.gt(0) ? new Decimal(h.marketValue).div(mv).mul(100).toFixed(2) : '0' }));
    const bp = await this.brokerage.buyingPower(acct as typeof acct & { provider_account_id: string }).catch(() => null);
    const snapshot = await this.brokerage.latestSnapshot(acct.id);
    const cashTotal = new Decimal(cash.total);
    return {
      operatingMode: this.cfg.operatingMode,
      dataNotice: this.cfg.operatingMode === 'sandbox' ? 'SANDBOX: simulated partner, simulated prices, no real money.' : null,
      account: { status: acct.status, accountNumber: acct.account_number, provider: acct.provider, lastSyncedAt: acct.last_synced_at },
      cash: cashOut,
      buyingPower: bp ? { amount: new Decimal(bp.buyingPower).toFixed(2), currency, asOf: bp.asOf, live: bp.live, source: 'partner' } : null,
      partnerSnapshot: snapshot ? { cash: snapshot.cash, equity: snapshot.equity, asOf: snapshot.as_of } : null,
      totals: {
        currency,
        marketValue: mv.toFixed(2),
        costBasis: cost.toFixed(2),
        unrealizedPl: mv.sub(cost).toFixed(2),
        dayChange: dayChange.toFixed(2),
        estimatedPortfolioValue: mv.add(cashTotal).toFixed(2),
        note: 'Estimated value uses the latest available prices and may differ from the partner\'s official valuation.',
      },
      holdings,
      allocation,
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Equity history from partner-reported account snapshots (no back-filled or synthetic values).' })
  async history(@Auth() a: AuthContext, @Query('days') days = '90') {
    const acct = await this.brokerage.accountForUser(a.subjectId);
    if (!acct) return { points: [] };
    const d = Math.min(Math.max(Number(days) || 90, 1), 1825);
    const points = await this.db.query<{ t: Date; equity: string; cash: string }>(
      `SELECT DISTINCT ON (date_trunc('hour', as_of)) date_trunc('hour', as_of) AS t, equity, cash
         FROM broker_account_snapshots WHERE brokerage_account_id = $1 AND as_of > now() - make_interval(days => $2)
        ORDER BY date_trunc('hour', as_of), as_of DESC`,
      [acct.id, d],
    );
    return { source: 'partner_snapshots', points: points.map((p) => ({ t: p.t, equity: p.equity, cash: p.cash })) };
  }
}
