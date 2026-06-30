import { IsUUID, IsNumber, Min, Max, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsStellarPublicKey } from '../../../common/validators/is-stellar-key.validator';
import { Trim } from '../../../common/validators/sanitize.transform';
import { IsPositiveAmount } from '../../../common/validators/is-positive-amount.validator';

export class SubscribeDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Savings product ID to subscribe to',
  })
  @IsUUID()
  productId: string;

  @ApiProperty({
    example: 5000,
    description: 'Amount to subscribe (max 7 decimal places)',
  })
  @IsNumber()
  @Min(0.01)
  @IsPositiveAmount(7)
  @Max(1_000_000_000, { message: 'amount must not exceed 1,000,000,000' })
  amount: number;

  @ApiPropertyOptional({
    example: 'GABCDEF234567ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHJKLMN',
    description:
      'Optional Stellar wallet address associated with this subscription',
  })
  @IsOptional()
  @Trim()
  @IsStellarPublicKey()
  walletAddress?: string;
}
