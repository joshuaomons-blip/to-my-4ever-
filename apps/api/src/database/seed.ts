/* Reference + development seed. Idempotent. Never creates customers or financial records. */
import { Client } from 'pg';
import { hashPassword } from '../auth/password';
import { encryptField } from '../common/crypto';
import { generateTotpSecret, otpauthUri } from '../common/totp';

// Instrument reference data. Tradability and fractionability must come from the partner's asset list in production.
export const INSTRUMENTS: Array<[string, string, string, 'equity' | 'etf', string, string | null, boolean]> = [
  ['AAPL', 'NASDAQ', 'Apple Inc.', 'equity', 'Technology', 'US0378331005', true],
  ['MSFT', 'NASDAQ', 'Microsoft Corporation', 'equity', 'Technology', 'US5949181045', true],
  ['NVDA', 'NASDAQ', 'NVIDIA Corporation', 'equity', 'Technology', 'US67066G1040', true],
  ['AMZN', 'NASDAQ', 'Amazon.com, Inc.', 'equity', 'Consumer Discretionary', 'US0231351067', true],
  ['GOOGL', 'NASDAQ', 'Alphabet Inc. Class A', 'equity', 'Communication Services', 'US02079K3059', true],
  ['META', 'NASDAQ', 'Meta Platforms, Inc.', 'equity', 'Communication Services', 'US30303M1027', true],
  ['TSLA', 'NASDAQ', 'Tesla, Inc.', 'equity', 'Consumer Discretionary', 'US88160R1014', true],
  ['JPM', 'NYSE', 'JPMorgan Chase & Co.', 'equity', 'Financials', 'US46625H1005', true],
  ['V', 'NYSE', 'Visa Inc.', 'equity', 'Financials', 'US92826C8394', true],
  ['JNJ', 'NYSE', 'Johnson & Johnson', 'equity', 'Health Care', 'US4781601046', true],
  ['KO', 'NYSE', 'The Coca-Cola Company', 'equity', 'Consumer Staples', 'US1912161007', true],
  ['XOM', 'NYSE', 'Exxon Mobil Corporation', 'equity', 'Energy', 'US30231G1022', true],
  ['SPY', 'NYSEARCA', 'SPDR S&P 500 ETF Trust', 'etf', 'Broad Market', 'US78462F1030', true],
  ['VOO', 'NYSEARCA', 'Vanguard S&P 500 ETF', 'etf', 'Broad Market', 'US9229083632', true],
  ['QQQ', 'NASDAQ', 'Invesco QQQ Trust', 'etf', 'Technology', 'US46090E1038', true],
  ['VTI', 'NYSEARCA', 'Vanguard Total Stock Market ETF', 'etf', 'Broad Market', 'US9229087690', true],
  ['IWM', 'NYSEARCA', 'iShares Russell 2000 ETF', 'etf', 'Small Cap', 'US4642876555', true],
  ['VEA', 'NYSEARCA', 'Vanguard FTSE Developed Markets ETF', 'etf', 'International', 'US9219438580', true],
  ['VWO', 'NYSEARCA', 'Vanguard FTSE Emerging Markets ETF', 'etf', 'International', 'US9220428588', true],
  ['AGG', 'NYSEARCA', 'iShares Core U.S. Aggregate Bond ETF', 'etf', 'Fixed Income', 'US4642872265', true],
  ['BND', 'NASDAQ', 'Vanguard Total Bond Market ETF', 'etf', 'Fixed Income', 'US9219378356', true],
  ['GLD', 'NYSEARCA', 'SPDR Gold Shares', 'etf', 'Commodities', 'US78463V1070', false],
  ['SCHD', 'NYSEARCA', 'Schwab U.S. Dividend Equity ETF', 'etf', 'Dividend', 'US8085247976', true],
];

// US-domiciled ETFs generally lack a PRIIPs KID, so EEA retail access is restricted by default (counsel to confirm).
const EEA = ['DE', 'FR', 'IE', 'NL', 'ES', 'IT'];

export async function seed(databaseUrl: string, opts: { encryptionKey?: Buffer; adminEmail?: string; adminPassword?: string; log?: (m: string) => void } = {}) {
  const log = opts.log ?? console.log;
  const c = new Client({ connectionString: databaseUrl });
  await c.connect();
  try {
    for (const [symbol, exchange, name, cls, sector, isin, fractionable] of INSTRUMENTS) {
      await c.query(
        `INSERT INTO instruments (symbol, exchange, name, asset_class, currency, isin, country, sector, fractionable, restricted_jurisdictions)
         VALUES ($1,$2,$3,$4,'USD',$5,'US',$6,$7,$8) ON CONFLICT (symbol, exchange) DO NOTHING`,
        [symbol, exchange, name, cls, isin, sector, fractionable, cls === 'etf' ? EEA : []],
      );
    }
    log(`instruments: ${INSTRUMENTS.length}`);
    if (opts.adminEmail && opts.adminPassword && opts.encryptionKey) {
      const existing = await c.query('SELECT id FROM staff_users WHERE email = $1', [opts.adminEmail]);
      if (!existing.rows[0]) {
        const secret = generateTotpSecret();
        const r = await c.query<{ id: string }>(
          'INSERT INTO staff_users (email, password_hash, display_name) VALUES ($1,$2,$3) RETURNING id',
          [opts.adminEmail, await hashPassword(opts.adminPassword), 'Bootstrap Administrator'],
        );
        const id = r.rows[0]!.id;
        await c.query('UPDATE staff_users SET mfa_secret_enc = $2, mfa_enabled = true WHERE id = $1', [id, encryptField(opts.encryptionKey, secret, `staff_users:${id}:mfa`)]);
        await c.query("INSERT INTO staff_roles (staff_id, role) VALUES ($1,'super_admin')", [id]);
        log(`bootstrap staff created: ${opts.adminEmail}`);
        log(`  TOTP secret (add to an authenticator app, then discard this output): ${secret}`);
        log(`  ${otpauthUri(secret, opts.adminEmail, 'Aureon Admin')}`);
      }
    }
  } finally {
    await c.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  seed(url, {
    encryptionKey: process.env.APP_ENCRYPTION_KEY ? Buffer.from(process.env.APP_ENCRYPTION_KEY, 'base64') : undefined,
    adminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL,
    adminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
