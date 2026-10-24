import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email: string;
  @ApiProperty({ minLength: 12 }) @IsString() @Length(12, 128) password: string;
  @ApiProperty() @IsString() @Length(1, 120) displayName: string;
  @ApiProperty({ example: 'GB', description: 'ISO 3166-1 alpha-2 country of residence' })
  @Matches(/^[A-Z]{2}$/) residenceCountry: string;
}

export class LoginDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email: string;
  @ApiProperty() @IsString() @Length(1, 128) password: string;
}

export class TokenDto {
  @ApiProperty() @IsString() @Length(20, 200) token: string;
}

export class EmailDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email: string;
}

export class ResetPasswordDto {
  @ApiProperty() @IsString() @Length(20, 200) token: string;
  @ApiProperty() @IsString() @Length(12, 128) password: string;
}

export class MfaCodeDto {
  @ApiPropertyOptional({ description: '6-digit TOTP code' }) @IsOptional() @Matches(/^\d{6}$/) code?: string;
  @ApiPropertyOptional({ description: 'One-time recovery code (login only)' }) @IsOptional() @IsString() @Length(6, 20) recoveryCode?: string;
}

export class StrictMfaCodeDto {
  @ApiProperty() @Matches(/^\d{6}$/) code: string;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() @Length(1, 128) currentPassword: string;
  @ApiProperty() @IsString() @Length(12, 128) newPassword: string;
}
