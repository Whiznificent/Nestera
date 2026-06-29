import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ReferralFraudReason } from '../referral-fraud.types';

@Entity('referral_fraud_audits')
@Index(['referralId'])
@Index(['createdAt'])
export class ReferralFraudAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  referralId: string;

  @Column('uuid', { nullable: true })
  referrerId: string | null;

  @Column('uuid', { nullable: true })
  refereeId: string | null;

  @Column({ type: 'jsonb' })
  reasons: ReferralFraudReason[];

  @Column({ type: 'jsonb' })
  decisionMetadata: Record<string, unknown>;

  @Column({ type: 'text' })
  rationale: string;

  @Column({ type: 'varchar', length: 32 })
  action: 'quarantine' | 'flag' | 'block_reward';

  @Column({ type: 'varchar', length: 64, nullable: true })
  actor: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
