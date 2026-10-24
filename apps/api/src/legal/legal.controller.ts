import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { APP_CONFIG, AppConfig } from '../config/config';
import { DbService } from '../database/db.service';
import { FeeService } from '../fees/fee.service';
import { fromMinor } from '../common/money';

/** Public, unauthenticated reference endpoints. */
@ApiTags('public')
@Controller('v1/public')
export class LegalController {
  constructor(private readonly db: DbService, private readonly fees: FeeService, @Inject(APP_CONFIG) private readonly cfg: AppConfig) {}

  @Get('platform')
  @ApiOperation({ summary: 'Operating mode and regulatory status banner information' })
  platform() {
    return {
      brand: 'Aureon Capital',
      operatingMode: this.cfg.operatingMode,
      notice:
        this.cfg.operatingMode === 'sandbox'
          ? 'Sandbox environment. Aureon Capital is not currently authorised to provide investment services. No real money or securities are involved.'
          : 'Brokerage services are provided by our licensed partner. See disclosures for details.',
    };
  }

  @Get('jurisdictions')
  jurisdictions() {
    return this.db.query(
      `SELECT code, name, region, status, onboarding_enabled AS "onboardingEnabled", allowed_currencies AS "allowedCurrencies"
         FROM jurisdictions ORDER BY name`,
    );
  }

  @Get('documents')
  documents() {
    return this.db.query(`SELECT DISTINCT ON (key) key, version, title, published_at AS "publishedAt" FROM legal_documents ORDER BY key, published_at DESC`);
  }

  @Get('fees')
  async feeSchedule() {
    const s = await this.fees.active('USD');
    return {
      version: s.version,
      currency: s.currency,
      commission: { rateBps: s.commission_bps, min: fromMinor(s.commission_min_minor, s.currency), max: s.commission_max_minor === null ? null : fromMinor(s.commission_max_minor, s.currency) },
      fxSpreadBps: s.fx_spread_bps,
      depositFee: fromMinor(s.deposit_fee_minor, s.currency),
      withdrawalFee: fromMinor(s.withdrawal_fee_minor, s.currency),
      notice: 'Illustrative sandbox schedule. Partner, exchange and regulatory fees may also apply.',
    };
  }
}
