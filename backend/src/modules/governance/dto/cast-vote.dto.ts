import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { VoteDirection } from '../entities/vote.entity';

export class CastVoteDto {
  @ApiProperty({
    enum: VoteDirection,
    description: 'The direction of the vote',
    example: VoteDirection.FOR,
  })
  @IsNotEmpty()
  @IsEnum(VoteDirection, {
    message: `direction must be one of: ${Object.values(VoteDirection).join(', ')}`,
  })
  direction!: VoteDirection;
}
