import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, Length } from 'class-validator';
import { Auth, CustomerGuard } from '../auth/guards';
import { AuditService } from '../common/audit.service';
import { randomToken } from '../common/crypto';
import { AppError } from '../common/errors';
import { RateLimit } from '../common/rate-limit';
import { AppRequest, AuthContext } from '../common/request-context';
import { DbService } from '../database/db.service';

export class CreateTicketDto {
  @ApiProperty() @IsString() @Length(3, 200) subject: string;
  @ApiProperty({ enum: ['account', 'onboarding', 'funding', 'trading', 'technical', 'complaint', 'other'] })
  @IsIn(['account', 'onboarding', 'funding', 'trading', 'technical', 'complaint', 'other']) category: string;
  @ApiProperty() @IsString() @Length(1, 10000) message: string;
}
export class TicketMessageDto {
  @ApiProperty() @IsString() @Length(1, 10000) message: string;
}

/** Complaint deadline: 8 weeks (UK FCA DISP final-response period) used as the conservative default; configure per jurisdiction. */
export const COMPLAINT_DEADLINE_DAYS = 56;

@ApiTags('support')
@Controller('v1/support/tickets')
@UseGuards(CustomerGuard)
export class SupportController {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  @Get()
  list(@Auth() a: AuthContext) {
    return this.db.query(
      `SELECT id, reference, subject, category, status, is_complaint AS "isComplaint", complaint_deadline AS "complaintDeadline", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM support_tickets WHERE user_id = $1 ORDER BY updated_at DESC`,
      [a.subjectId],
    );
  }

  @Post()
  @RateLimit({ name: 'ticket-create', limit: 10, windowSeconds: 86400, by: 'subject' })
  async create(@Auth() a: AuthContext, @Body() dto: CreateTicketDto, @Req() req: AppRequest) {
    const isComplaint = dto.category === 'complaint';
    const ref = `AUR-${randomToken(5).toUpperCase().replace(/[^A-Z0-9]/g, 'X').slice(0, 7)}`;
    return this.db.tx(async (c) => {
      const t = (
        await c.query<{ id: string; reference: string }>(
          `INSERT INTO support_tickets (reference, user_id, subject, category, is_complaint, complaint_deadline, priority)
           VALUES ($1,$2,$3,$4,$5, CASE WHEN $5 THEN now() + make_interval(days => $6) END, CASE WHEN $5 THEN 'high' ELSE 'normal' END)
           RETURNING id, reference`,
          [ref, a.subjectId, dto.subject, dto.category, isComplaint, COMPLAINT_DEADLINE_DAYS],
        )
      ).rows[0]!;
      await c.query("INSERT INTO ticket_messages (ticket_id, author_type, author_id, body) VALUES ($1,'customer',$2,$3)", [t.id, a.subjectId, dto.message]);
      if (isComplaint) {
        await c.query("INSERT INTO ticket_messages (ticket_id, author_type, body) VALUES ($1,'system',$2)", [
          t.id,
          `We have received your complaint (reference ${t.reference}). We will acknowledge it promptly and aim to send a final response within ${COMPLAINT_DEADLINE_DAYS / 7} weeks. If you are not satisfied with our response you may be able to refer it to the relevant ombudsman or regulator in your country.`,
        ]);
      }
      await this.audit.record({ actorType: 'customer', actorId: a.subjectId, action: isComplaint ? 'support.complaint_opened' : 'support.ticket_opened', targetType: 'support_ticket', targetId: t.id, req }, c);
      return t;
    });
  }

  @Get(':id')
  async get(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.db.one('SELECT id, reference, subject, category, status, is_complaint AS "isComplaint", complaint_deadline AS "complaintDeadline", created_at AS "createdAt" FROM support_tickets WHERE id = $1 AND user_id = $2', [id, a.subjectId]);
    if (!t) throw new AppError('NOT_FOUND', 'Ticket not found', 404);
    const messages = await this.db.query('SELECT id, author_type AS "authorType", body, created_at AS "createdAt" FROM ticket_messages WHERE ticket_id = $1 AND internal = false ORDER BY id', [id]);
    return { ...t, messages };
  }

  @Post(':id/messages')
  @RateLimit({ name: 'ticket-message', limit: 60, windowSeconds: 3600, by: 'subject' })
  async reply(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TicketMessageDto) {
    const t = await this.db.one<{ status: string }>('SELECT status FROM support_tickets WHERE id = $1 AND user_id = $2', [id, a.subjectId]);
    if (!t) throw new AppError('NOT_FOUND', 'Ticket not found', 404);
    if (t.status === 'closed') throw new AppError('TICKET_CLOSED', 'This ticket is closed. Please open a new one.', 409);
    await this.db.tx(async (c) => {
      await c.query("INSERT INTO ticket_messages (ticket_id, author_type, author_id, body) VALUES ($1,'customer',$2,$3)", [id, a.subjectId, dto.message]);
      await c.query("UPDATE support_tickets SET status = 'open' WHERE id = $1", [id]);
    });
    return { status: 'sent' };
  }
}
