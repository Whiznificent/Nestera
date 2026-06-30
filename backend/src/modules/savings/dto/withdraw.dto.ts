import {
  IsUUID,
  IsNumber,
  Max,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsPositiveAmount } from '../../../common/validators/is-positive-amount.validator';
import { Trim } from '../../../common/validators/sanitize.transform';

export class WithdrawDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Subscription ID to withdraw from',
  })
  @IsUUID()
  subscriptionId: string;

  @ApiProperty({
    example: 1000.5,
    description: 'Amount to withdraw (max 7 decimal places)',
  })
  @IsNumber()
  @IsPositiveAmount(7)
  @Max(1_000_000_000, { message: 'amount must not exceed 1,000,000,000' })
  amount: number;

  @ApiPropertyOptional({
    example: 'emergency',
    description: 'Optional reason for withdrawal',
  })
  @IsOptional()
  @IsString()
  @Trim()
  @MaxLength(500)
  reason?: string;
}
