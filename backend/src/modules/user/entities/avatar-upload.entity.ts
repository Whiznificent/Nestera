import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';

export enum AvatarProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('avatar_uploads')
@Index(['userId', 'createdAt'])
export class AvatarUpload {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ApiProperty()
  @Column({ type: 'varchar' })
  originalFilename: string;

  @ApiProperty()
  @Column({ type: 'varchar' })
  storagePath: string;

  @ApiProperty()
  @Column({ type: 'varchar' })
  mimeType: string;

  @ApiProperty()
  @Column({ type: 'int' })
  fileSize: number;

  @ApiProperty({ enum: AvatarProcessingStatus })
  @Column({
    type: 'enum',
    enum: AvatarProcessingStatus,
    default: AvatarProcessingStatus.PENDING,
  })
  processingStatus: AvatarProcessingStatus;

  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', nullable: true })
  jobId: string | null;

  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', nullable: true })
  processedUrl: string | null;

  @ApiProperty({ nullable: true })
  @Column({ type: 'text', nullable: true })
  processingError: string | null;

  @ApiProperty({ nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  processingMetadata: Record<string, unknown> | null;

  @ApiProperty()
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt: Date;
}
