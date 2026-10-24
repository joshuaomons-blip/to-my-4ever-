import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsBoolean, IsIn, IsOptional, IsString, Length, Matches, ValidateNested } from 'class-validator';

export class ProfileDto {
  @ApiProperty() @IsString() @Length(1, 100) legalFirstName: string;
  @ApiProperty() @IsString() @Length(1, 100) legalLastName: string;
  @ApiProperty({ example: '1990-04-12' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) dateOfBirth: string;
  @ApiProperty({ example: 'GB' }) @Matches(/^[A-Z]{2}$/) nationality: string;
  @ApiProperty({ example: 'GB' }) @Matches(/^[A-Z]{2}$/) residenceCountry: string;
  @ApiProperty() @IsString() @Length(1, 200) addressLine1: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 200) addressLine2?: string;
  @ApiProperty() @IsString() @Length(1, 100) city: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 100) region?: string;
  @ApiProperty() @IsString() @Length(2, 20) postalCode: string;
  @ApiProperty({ example: '+447700900123' }) @Matches(/^\+[1-9]\d{6,14}$/) phone: string;
  @ApiPropertyOptional({ description: 'Tax ID (SSN/NI/TIN). Encrypted at rest; only the last 4 characters are ever returned.' })
  @IsOptional() @Matches(/^[A-Za-z0-9-]{4,30}$/) taxId?: string;
  @ApiProperty({ enum: ['employed', 'self_employed', 'unemployed', 'retired', 'student'] })
  @IsIn(['employed', 'self_employed', 'unemployed', 'retired', 'student']) employmentStatus: string;
  @ApiProperty({ enum: ['<25k', '25k-50k', '50k-100k', '100k-250k', '>250k'] }) @IsIn(['<25k', '25k-50k', '50k-100k', '100k-250k', '>250k']) annualIncomeBand: string;
  @ApiProperty({ enum: ['<25k', '25k-100k', '100k-500k', '500k-1m', '>1m'] }) @IsIn(['<25k', '25k-100k', '100k-500k', '500k-1m', '>1m']) netWorthBand: string;
  @ApiProperty({ enum: ['none', 'limited', 'good', 'extensive'] }) @IsIn(['none', 'limited', 'good', 'extensive']) investmentExperience: string;
  @ApiProperty({ enum: ['conservative', 'moderate', 'aggressive'] }) @IsIn(['conservative', 'moderate', 'aggressive']) riskTolerance: string;
  @ApiProperty({ enum: ['employment_income', 'investments', 'inheritance', 'business_income', 'savings', 'family'] })
  @IsIn(['employment_income', 'investments', 'inheritance', 'business_income', 'savings', 'family']) fundingSource: string;
  @ApiProperty() @IsBoolean() isPoliticallyExposed: boolean;
  @ApiProperty() @IsBoolean() isControlPerson: boolean;
  @ApiProperty() @IsBoolean() isAffiliatedExchange: boolean;
}

export class DocumentRefDto {
  @ApiProperty() @IsString() @Length(1, 60) key: string;
  @ApiProperty() @IsString() @Length(1, 40) version: string;
}

export class AcceptDisclosuresDto {
  @ApiProperty({ type: [DocumentRefDto] }) @ValidateNested({ each: true }) @Type(() => DocumentRefDto) @ArrayMinSize(1) documents: DocumentRefDto[];
}
