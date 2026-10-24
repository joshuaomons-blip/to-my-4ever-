import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

export class DecisionDto {
  @ApiProperty({ enum: ['approve', 'reject'] }) @IsIn(['approve', 'reject']) decision: 'approve' | 'reject';
  @ApiProperty() @IsString() @Length(5, 2000) reason: string;
}
export class ScreeningReviewDto {
  @ApiProperty({ enum: ['false_positive', 'confirmed_match'] }) @IsIn(['false_positive', 'confirmed_match']) outcome: 'false_positive' | 'confirmed_match';
  @ApiProperty() @IsString() @Length(5, 2000) note: string;
}
export class RestrictionDto {
  @ApiProperty({ enum: ['trading_block', 'deposit_block', 'withdrawal_block', 'full_freeze', 'close_only'] })
  @IsIn(['trading_block', 'deposit_block', 'withdrawal_block', 'full_freeze', 'close_only']) type: string;
  @ApiProperty() @IsString() @Length(5, 2000) reason: string;
}
export class ReasonDto {
  @ApiProperty() @IsString() @Length(5, 2000) reason: string;
}
export class AlertUpdateDto {
  @ApiProperty({ enum: ['investigating', 'escalated', 'closed_no_action', 'closed_reported'] })
  @IsIn(['investigating', 'escalated', 'closed_no_action', 'closed_reported']) status: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(5, 2000) note?: string;
  @ApiPropertyOptional({ description: 'Reference of an external regulatory filing made outside this system' }) @IsOptional() @IsString() @Length(1, 200) externalFilingRef?: string;
}
export class BreakResolveDto {
  @ApiProperty() @IsString() @Length(5, 2000) note: string;
}
export class TicketReplyDto {
  @ApiProperty() @IsString() @Length(1, 10000) message: string;
  @ApiProperty() @IsBoolean() internal: boolean;
  @ApiPropertyOptional({ enum: ['open', 'pending_customer', 'pending_internal', 'resolved', 'closed'] })
  @IsOptional() @IsIn(['open', 'pending_customer', 'pending_internal', 'resolved', 'closed']) status?: string;
}
export class FeeScheduleDto {
  @ApiProperty({ example: 'USD' }) @Matches(/^[A-Z]{3}$/) currency: string;
  @ApiProperty() @IsInt() @Min(0) @Max(500) commissionBps: number;
  @ApiProperty({ description: 'minor units' }) @IsInt() @Min(0) commissionMinMinor: number;
  @ApiPropertyOptional({ description: 'minor units' }) @IsOptional() @IsInt() @Min(0) commissionMaxMinor?: number;
  @ApiProperty() @IsInt() @Min(0) @Max(500) fxSpreadBps: number;
  @ApiProperty() @IsInt() @Min(0) depositFeeMinor: number;
  @ApiProperty() @IsInt() @Min(0) withdrawalFeeMinor: number;
  @ApiProperty() @IsString() @Length(5, 2000) notes: string;
}
export class ControlDto {
  @ApiProperty() @IsBoolean() enabled: boolean;
  @ApiProperty() @IsString() @Length(5, 500) reason: string;
}
export class JurisdictionUpdateDto {
  @ApiProperty({ enum: ['blocked', 'waitlist', 'sandbox_only', 'live'] }) @IsIn(['blocked', 'waitlist', 'sandbox_only', 'live']) status: string;
  @ApiProperty() @IsBoolean() onboardingEnabled: boolean;
  @ApiProperty() @IsBoolean() tradingEnabled: boolean;
  @ApiProperty() @IsBoolean() depositsEnabled: boolean;
  @ApiProperty() @IsBoolean() withdrawalsEnabled: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 200) legalReviewRef?: string;
  @ApiProperty() @IsString() @Length(5, 1000) reason: string;
}
export class GateApprovalDto {
  @ApiProperty({ description: 'Reference to signed evidence (e.g. document ID in the compliance DMS)' }) @IsString() @Length(3, 300) evidenceRef: string;
}
export class CreateStaffDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @Length(1, 120) displayName: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsIn(['super_admin', 'compliance_officer', 'operations', 'finance', 'support_agent', 'auditor'], { each: true }) roles: string[];
}
