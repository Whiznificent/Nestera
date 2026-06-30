import { ApiProperty } from '@nestjs/swagger';
import { AvatarProcessingStatus } from '../entities/avatar-upload.entity';

export class AvatarUploadResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: AvatarProcessingStatus })
  processingStatus: AvatarProcessingStatus;

  @ApiProperty({ nullable: true })
  jobId: string | null;

  @ApiProperty({ nullable: true })
  processedUrl: string | null;

  @ApiProperty({ nullable: true })
  processingError: string | null;

  @ApiProperty()
  createdAt: Date;
}
