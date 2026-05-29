import {
  IsString,
  IsNumber,
  IsOptional,
  Min,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSavingsGroupDto {
  @ApiProperty({
    example: 'Family Vacation',
    description: 'The name of the savings group',
    minLength: 1,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty({ message: 'Group name is required' })
  @MaxLength(255, { message: 'Group name must not exceed 255 characters' })
  name: string;

  @ApiProperty({
    example: 'Saving up for our summer trip to Japan',
    description: 'A brief description of the group goal',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 5000,
    description: 'The total target amount for the group',
    minimum: 1,
  })
  @IsNumber({}, { message: 'Target amount must be a valid number' })
  @Min(1, { message: 'Target amount must be at least 1' })
  targetAmount: number;

  @ApiProperty({
    example: 'prod-uuid-1',
    description: 'The savings product ID this pool is based on',
  })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({
    example: 'GB...XYZ',
    description: 'The multisig wallet address for the group pool',
  })
  @IsString()
  @IsNotEmpty()
  multisigAddress: string;

  @ApiProperty({
    example: 2,
    description: 'Number of signatures required for withdrawals',
  })
  @IsNumber()
  @Min(1)
  requiredSignatures: number;

  @ApiProperty({
    example: 3,
    description: 'Total number of signers in the multisig setup',
  })
  @IsNumber()
  @Min(1)
  totalSigners: number;
}
