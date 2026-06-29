import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { GovernanceProposal } from './governance-proposal.entity';

export enum VoteDirection {
  AGAINST = 'AGAINST',
  FOR = 'FOR',
  ABSTAIN = 'ABSTAIN',
}

/**
 * Named unique constraint on the concrete columns (walletAddress, proposalId),
 * not on the relation object.  Using the column names guarantees the DB-level
 * UNIQUE constraint is emitted correctly regardless of TypeORM version.
 *
 * A PostgreSQL UNIQUE constraint implicitly creates a B-tree index, so no
 * separate @Index is needed for query performance.
 */
@Entity('votes')
@Unique('uq_vote_wallet_proposal', ['walletAddress', 'proposalId'])
export class Vote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  walletAddress: string;

  @Column({ type: 'enum', enum: VoteDirection })
  direction: VoteDirection;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  weight: number;

  @ManyToOne(() => GovernanceProposal, (proposal) => proposal.votes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'proposalId' })
  proposal: GovernanceProposal;

  @Column()
  proposalId: string;

  @CreateDateColumn()
  createdAt: Date;
}
