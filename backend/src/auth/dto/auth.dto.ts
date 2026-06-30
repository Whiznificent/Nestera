import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsStellarPublicKey } from '../../common/validators/is-stellar-key.validator';
import { IsStrongPassword } from '../../common/validators/is-strong-password.validator';
import { Trim } from '../../common/validators/sanitize.transform';

export class RegisterDto {
  @ApiProperty({ example: 'alice@example.com' })
  @Trim()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'supersecret123' })
  @IsString()
  @MinLength(8)
  @MaxLength(72, { message: 'password must not exceed 72 characters' })
  @IsStrongPassword()
  password: string;

  @ApiProperty({ example: 'Alice', required: false })
  @IsString()
  @Trim()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    example: 'ABC12345',
    description: 'Referral code from another user',
  })
  @IsOptional()
  @IsString()
  @Trim()
  @Matches(/^[A-Z0-9]{4,12}$/, {
    message: 'referralCode must be 4-12 uppercase alphanumeric characters',
  })
  referralCode?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'supersecret123' })
  @IsString()
  password: string;
}

export class GetNonceDto {
  @ApiProperty({ example: 'GABC...' })
  @IsStellarPublicKey()
  publicKey: string;
}

export class VerifySignatureDto {
  @ApiProperty({ example: 'GABC...' })
  @IsStellarPublicKey()
  publicKey: string;

  @ApiProperty({ description: 'Hex-encoded Ed25519 signature over the nonce' })
  @IsString()
  signature: string;

  @ApiProperty({ description: 'The nonce returned by GET /auth/nonce' })
  @IsString()
  nonce: string;
}

/**
 * Body accepted by POST /auth/link-wallet.
 * The caller must:
 *  1. Fetch a nonce via GET /auth/nonce?publicKey=<key>
 *  2. Sign the nonce bytes with the wallet's Ed25519 secret key
 *  3. Submit this DTO together with a valid JWT (Bearer token)
 */
export class LinkWalletDto {
  @ApiProperty({
    example: 'GABC1234...',
    description: 'Stellar G... public key to link to the authenticated account',
  })
  @IsStellarPublicKey()
  publicKey: string;

  @ApiProperty({
    description: 'The nonce returned by GET /auth/nonce?publicKey=<key>',
  })
  @IsString()
  nonce: string;

  @ApiProperty({
    description: 'Hex-encoded Ed25519 signature of the nonce bytes',
  })
  @IsString()
  signature: string;
}
