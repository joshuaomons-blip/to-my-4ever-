import { Body, Controller, Get, HttpCode, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, CustomerGuard } from '../auth/guards';
import { RateLimit } from '../common/rate-limit';
import { AppRequest, AuthContext } from '../common/request-context';
import { AcceptDisclosuresDto, ProfileDto } from './onboarding.dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('onboarding')
@Controller('v1/onboarding')
@UseGuards(CustomerGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  status(@Auth() a: AuthContext) {
    return this.onboarding.status(a.subjectId);
  }

  @Put('profile')
  @RateLimit({ name: 'profile', limit: 30, windowSeconds: 3600, by: 'subject' })
  async profile(@Auth() a: AuthContext, @Body() dto: ProfileDto, @Req() req: AppRequest) {
    const eligibility = await this.onboarding.saveProfile(a.subjectId, dto, req);
    return { eligibility, onboarding: await this.onboarding.status(a.subjectId) };
  }

  @Post('disclosures')
  @HttpCode(200)
  accept(@Auth() a: AuthContext, @Body() dto: AcceptDisclosuresDto, @Req() req: AppRequest) {
    return this.onboarding.acceptDisclosures(a.subjectId, dto.documents, req);
  }

  @Post('submit')
  @HttpCode(200)
  @RateLimit({ name: 'onboarding-submit', limit: 5, windowSeconds: 3600, by: 'subject' })
  submit(@Auth() a: AuthContext, @Req() req: AppRequest) {
    return this.onboarding.submit(a.subjectId, req);
  }
}
