import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { GovernanceProposal, ProposalStatus } from './governance-proposal.entity';

/**
 * Immutable record of every governance proposal state transition.
 * Written once on each status change and never updated, forming a complete
 * and tamper-evident lifecycle audit trail.
 */
@Entity('proposal_transitions')
@Index(['proposalId', 'transitionedAt'])
export class ProposalTransition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  proposalId: string;

  @ManyToOne(() => GovernanceProposal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proposalId' })
  proposal: GovernanceProposal;

  @Column({ type: 'varchar', length: 30 })
  fromStatus: ProposalStatus;

  @Column({ type: 'varchar', length: 30 })
  toStatus: ProposalStatus;

  /** userId or 'system' (scheduler). Null if the actor is unknown. */
  @Column({ type: 'varchar', nullable: true })
  triggeredBy: string | null;

  /** Human-readable reason: quorum outcome, cancellation note, etc. */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  /**
   * Structured context captured at transition time:
   * vote tallies, quorum figures, timelock timestamp, current ledger, etc.
   * Stored as JSONB so it is queryable but schema-flexible.
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  transitionedAt: Date;
}
