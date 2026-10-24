import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config';
import { DbService } from '../database/db.service';
import { AppError } from '../common/errors';

export type ControlKey = 'onboarding_enabled' | 'trading_enabled' | 'deposits_enabled' | 'withdrawals_enabled';

/** Global kill switches (DB-backed, short cache) and the real-money launch gate check. */
@Injectable()
export class ControlsService implements OnModuleInit {
  private readonly logger = new Logger('Controls');
  private cache: { at: number; values: Map<string, boolean> } | null = null;

  constructor(private readonly db: DbService, @Inject(APP_CONFIG) private readonly cfg: AppConfig) {}

  async onModuleInit(): Promise<void> {
    if (this.cfg.operatingMode === 'live') {
      const pending = await this.pendingLaunchGates();
      if (pending.length) {
        throw new Error(`Refusing to start in live mode. Unapproved launch gates: ${pending.join(', ')}`);
      }
      this.logger.warn('LIVE operating mode: real-money operations enabled by approved launch gates');
    } else {
      this.logger.log('SANDBOX operating mode: no real money, simulated providers');
    }
  }

  async pendingLaunchGates(): Promise<string[]> {
    const rows = await this.db.query<{ key: string }>(
      `SELECT g.key FROM launch_gates g
         LEFT JOIN launch_gate_approvals a ON a.gate_key = g.key
        GROUP BY g.key, g.required_approvals
       HAVING count(a.staff_id) < g.required_approvals
        ORDER BY g.key`,
    );
    return rows.map((r) => r.key);
  }

  invalidate(): void {
    this.cache = null;
  }

  async isEnabled(key: ControlKey): Promise<boolean> {
    if (!this.cache || Date.now() - this.cache.at > 5000) {
      const rows = await this.db.query<{ key: string; enabled: boolean }>('SELECT key, enabled FROM platform_controls');
      this.cache = { at: Date.now(), values: new Map(rows.map((r) => [r.key, r.enabled])) };
    }
    return this.cache.values.get(key) ?? false;
  }

  async assertEnabled(key: ControlKey): Promise<void> {
    if (!(await this.isEnabled(key))) {
      throw new AppError('PLATFORM_PAUSED', `This service is temporarily paused (${key.replace('_enabled', '')})`, 503);
    }
  }
}
