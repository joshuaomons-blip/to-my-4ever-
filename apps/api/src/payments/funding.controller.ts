import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, CustomerGuard, RequireStepUp } from '../auth/guards';
import { Idempotent, idempotencyKeyFrom } from '../common/idempotency';
import { RateLimit } from '../common/rate-limit';
import { AppRequest, AuthContext } from '../common/request-context';
import { AddPaymentMethodDto, MoneyMovementDto } from './funding.dto';
import { DEPOSIT_LIMITS, FundingService } from './funding.service';
import { fromMinor } from '../common/money';

@ApiTags('funding')
@Controller('v1/funding')
@UseGuards(CustomerGuard)
export class FundingController {
  constructor(private readonly funding: FundingService) {}

  @Get()
  async overview(@Auth() a: AuthContext) {
    return {
      methods: await this.funding.methods(a.subjectId),
      ...(await this.funding.history(a.subjectId)),
      limits: {
        depositMin: fromMinor(DEPOSIT_LIMITS.minMinor, 'USD'),
        depositMaxPerTransaction: fromMinor(DEPOSIT_LIMITS.maxPerTxnMinor, 'USD'),
        depositMaxPerDay: fromMinor(DEPOSIT_LIMITS.maxPerDayMinor, 'USD'),
      },
    };
  }

  @Post('methods')
  @RequireStepUp()
  @RateLimit({ name: 'add-method', limit: 5, windowSeconds: 86400, by: 'subject', failClosed: true })
  @ApiOperation({ summary: 'Link a payment method (requires recent MFA step-up)' })
  addMethod(@Auth() a: AuthContext, @Body() dto: AddPaymentMethodDto, @Req() req: AppRequest) {
    return this.funding.addMethod(a.subjectId, dto, req);
  }

  @Post('deposits')
  @Idempotent('funding.deposit')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RateLimit({ name: 'deposit', limit: 10, windowSeconds: 3600, by: 'subject', failClosed: true })
  deposit(@Auth() a: AuthContext, @Body() dto: MoneyMovementDto, @Req() req: AppRequest) {
    return this.funding.createDeposit(a.subjectId, dto, idempotencyKeyFrom(req), req);
  }

  @Post('withdrawals')
  @RequireStepUp()
  @Idempotent('funding.withdrawal')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RateLimit({ name: 'withdrawal', limit: 5, windowSeconds: 3600, by: 'subject', failClosed: true })
  @ApiOperation({ summary: 'Request a withdrawal (requires recent MFA step-up; may be held for review)' })
  withdraw(@Auth() a: AuthContext, @Body() dto: MoneyMovementDto, @Req() req: AppRequest) {
    return this.funding.createWithdrawal(a.subjectId, dto, idempotencyKeyFrom(req), req);
  }

  @Post('withdrawals/:id/cancel')
  @HttpCode(200)
  async cancel(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    await this.funding.cancelWithdrawal(a.subjectId, id, req);
    return { status: 'canceled' };
  }
}
