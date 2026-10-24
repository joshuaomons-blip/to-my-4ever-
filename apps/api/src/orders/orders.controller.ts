import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, CustomerGuard } from '../auth/guards';
import { Idempotent, idempotencyKeyFrom } from '../common/idempotency';
import { money } from '../common/money';
import { RateLimit } from '../common/rate-limit';
import { AppRequest, AuthContext } from '../common/request-context';
import { OrderRequestDto } from './orders.dto';
import { OrdersService, presentOrder } from './orders.service';

@ApiTags('orders')
@Controller('v1/orders')
@UseGuards(CustomerGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('preview')
  @HttpCode(200)
  @RateLimit({ name: 'order-preview', limit: 120, windowSeconds: 60, by: 'subject' })
  @ApiOperation({ summary: 'Validate an order and estimate cost, commission and reserve. Nothing is submitted.' })
  preview(@Auth() a: AuthContext, @Body() dto: OrderRequestDto) {
    return this.orders.preview(a.subjectId, dto);
  }

  @Post()
  @Idempotent('orders.place')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RateLimit({ name: 'order-place', limit: 30, windowSeconds: 60, by: 'subject', failClosed: true })
  @ApiOperation({ summary: 'Place an order with the brokerage partner. Repeating the same Idempotency-Key never creates a second order.' })
  async place(@Auth() a: AuthContext, @Body() dto: OrderRequestDto, @Req() req: AppRequest) {
    const o = await this.orders.place(a.subjectId, dto, idempotencyKeyFrom(req), req);
    return presentOrder({ ...o, symbol: dto.symbol });
  }

  @Get()
  async list(@Auth() a: AuthContext, @Query('status') status?: 'open' | 'closed') {
    const rows = await this.orders.list(a.subjectId, { status });
    return rows.map((r) => presentOrder(r as Parameters<typeof presentOrder>[0]));
  }

  @Get(':id')
  async detail(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    const d = await this.orders.detail(a.subjectId, id);
    return {
      order: presentOrder(d.order),
      events: d.events,
      executions: d.executions.map((e) => ({
        id: e.id,
        partnerExecutionId: e.provider_execution_id,
        quantity: e.quantity,
        price: e.price,
        gross: money(BigInt(e.gross_minor), d.order.currency),
        commission: money(BigInt(e.fee_minor), d.order.currency),
        executedAt: e.executed_at,
        settlementDate: e.settlement_date,
        settled: !!e.settled_at,
      })),
    };
  }

  @Get(':id/confirmation')
  @ApiOperation({ summary: 'Trade confirmation derived from partner execution records. The partner-issued confirmation is authoritative.' })
  async confirmation(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    const d = await this.orders.detail(a.subjectId, id);
    return {
      title: 'Trade confirmation (platform summary)',
      notice: 'This summary is generated from execution records reported by our brokerage partner. The official confirmation is issued by the partner and available under Statements & documents.',
      order: presentOrder(d.order),
      executions: d.executions.map((e) => ({
        partnerExecutionId: e.provider_execution_id, quantity: e.quantity, price: e.price,
        gross: money(BigInt(e.gross_minor), d.order.currency), commission: money(BigInt(e.fee_minor), d.order.currency),
        executedAt: e.executed_at, settlementDate: e.settlement_date,
      })),
    };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RateLimit({ name: 'order-cancel', limit: 30, windowSeconds: 60, by: 'subject' })
  async cancel(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    return presentOrder(await this.orders.cancel(a.subjectId, id, req));
  }
}
