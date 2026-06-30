import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('admin_confirmations')
@Index(['token'], { unique: true })
@Index(['adminId', 'isUsed'])
@Index(['expiresAt'])
export class AdminConfirmation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  adminId: string;

  @Column()
  token: string;

  @Column()
  actionType: string;

  @Column('jsonb')
  actionDetails: Record<string, any>;

  @Column({ default: false })
  isUsed: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ nullable: true })
  usedAt?: Date;
}
