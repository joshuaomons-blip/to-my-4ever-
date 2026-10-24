import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

const DECIMAL = /^\d{1,12}(\.\d{1,9})?$/;
const PRICE = /^\d{1,10}(\.\d{1,4})?$/;

export class OrderRequestDto {
  @ApiProperty({ example: 'AAPL' }) @Matches(/^[A-Z0-9.\-]{1,12}$/) symbol: string;
  @ApiProperty({ enum: ['buy', 'sell'] }) @IsIn(['buy', 'sell']) side: 'buy' | 'sell';
  @ApiProperty({ enum: ['market', 'limit', 'stop', 'stop_limit'] }) @IsIn(['market', 'limit', 'stop', 'stop_limit'])
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  @ApiProperty({ enum: ['day', 'gtc', 'ioc', 'fok'] }) @IsIn(['day', 'gtc', 'ioc', 'fok']) timeInForce: 'day' | 'gtc' | 'ioc' | 'fok';
  @ApiProperty({ example: '10', description: 'Share quantity (decimal string)' }) @IsString() @Matches(DECIMAL) quantity: string;
  @ApiPropertyOptional({ example: '190.50' }) @IsOptional() @Matches(PRICE) limitPrice?: string;
  @ApiPropertyOptional({ example: '185.00' }) @IsOptional() @Matches(PRICE) stopPrice?: string;
}
