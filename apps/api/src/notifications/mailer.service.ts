import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config';
import { DbService } from '../database/db.service';

export interface EmailMessage {
  to: string;
  template: string;
  subject: string;
  body: string;
}

/**
 * Mailer boundary. Sandbox/dev: messages are captured in `outbound_emails` (and the logger, without links).
 * Production: plug in a transactional email provider (e.g. SES, Postmark) behind this same interface,
 * with SPF/DKIM/DMARC configured for the sending domain.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger('Mailer');
  constructor(private readonly db: DbService, @Inject(APP_CONFIG) private readonly cfg: AppConfig) {}

  async send(msg: EmailMessage): Promise<void> {
    if (this.cfg.operatingMode === 'live') {
      throw new Error('No production email transport configured. Implement an ESP adapter before live operation.');
    }
    await this.db.query('INSERT INTO outbound_emails (to_address, template, subject, body) VALUES ($1,$2,$3,$4)', [
      msg.to,
      msg.template,
      msg.subject,
      msg.body,
    ]);
    this.logger.log(`captured email template=${msg.template}`);
  }
}

@Injectable()
export class NotificationService {
  constructor(private readonly db: DbService) {}

  async notify(userId: string, kind: string, title: string, body: string, data: Record<string, unknown> = {}, q?: { query: DbService['pool']['query'] }) {
    await (q ?? this.db.pool).query(
      'INSERT INTO notifications (user_id, kind, title, body, data) VALUES ($1,$2,$3,$4,$5)',
      [userId, kind, title, body, JSON.stringify(data)],
    );
  }
}
