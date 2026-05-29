import { IsOptional, IsString, MaxLength, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  lastLoginAt?: Date;
}

export class ApproveKycDto {
  @IsString()
  userId: string;
}

export class RejectKycDto {
  @IsString()
  userId: string;

  @IsString()
  reason: string;
}
