import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, Length, Matches } from 'class-validator';

export class AddPaymentMethodDto {
  @ApiProperty({ enum: ['bank_account', 'card', 'mobile_money', 'wallet'] }) @IsIn(['bank_account', 'card', 'mobile_money', 'wallet']) type: 'bank_account' | 'card' | 'mobile_money' | 'wallet';
  @ApiProperty() @IsString() @Length(1, 60) label: string;
  @ApiProperty({ example: '6789' }) @Matches(/^\d{4}$/) last4: string;
  @ApiProperty({ example: 'USD' }) @Matches(/^[A-Z]{3}$/) currency: string;
}

export class MoneyMovementDto {
  @ApiProperty({ example: '250.00' }) @Matches(/^\d{1,9}(\.\d{1,2})?$/) amount: string;
  @ApiProperty({ example: 'USD' }) @Matches(/^[A-Z]{3}$/) currency: string;
  @ApiProperty() @IsUUID() paymentMethodId: string;
}
