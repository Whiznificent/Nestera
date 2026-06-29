import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InvitationStatus } from '../entities/group-invitation.entity';

export class RespondInvitationDto {
  @ApiProperty({
    enum: InvitationStatus,
    example: InvitationStatus.ACCEPTED,
    description: 'Accept or reject the invitation',
  })
  @IsEnum(InvitationStatus)
  status: InvitationStatus.ACCEPTED | InvitationStatus.REJECTED;

  @ApiProperty({
    example: 'Thanks for the invite!',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
