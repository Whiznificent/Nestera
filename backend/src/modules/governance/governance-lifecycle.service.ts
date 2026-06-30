import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import {
  GovernanceProposal,
  ProposalStatus,
} from './entities/governance-proposal.entity';
import { Vote, VoteDirection } from './entities/vote.entity';
import { ProposalTransition } from './entities/proposal-transition.entity';
import { StellarService } from '../blockchain/stellar.service';

export interface WeightedTally {
  forWeight: number;
  againstWeight: number;
  abstainWeight: number;
  totalWeight: number;
  totalVoters: number;
}

export interface TransitionOptions {
  /** userId or the string 'system' for scheduler-triggered transitions */
  triggeredBy?: string;
  /** Human-readable explanation of why the transition occurred */
  reason?: string;
  /** Structured data captured at transition time (tallies, ledger, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Explicit state machine for governance proposal lifecycle.
 * Only edges listed here are allowed; any other attempt is rejected with 400.
 *
 *  PENDING  ──► ACTIVE      (activation on startBlock)
 *  PENDING  ──► CANCELLED
 *  ACTIVE   ──► PASSED      (voting closed, quorum + majority met)
 *  ACTIVE   ──► FAILED      (voting closed, quorum or majority not met)
 *  ACTIVE   ──► CANCELLED
 *  PASSED   ──► QUEUED      (queued for timelock)
 *  PASSED   ──► CANCELLED
 *  QUEUED   ──► EXECUTED    (timelock elapsed, action applied)
 *  QUEUED   ──► CANCELLED
 *  EXECUTED ──► (terminal)
 *  FAILED   ──► (terminal)
 *  CANCELLED──► (terminal)
 */
const ALLOWED_TRANSITIONS: Readonly<
  Partial<Record<ProposalStatus, ProposalStatus[]>>
> = {
  [ProposalStatus.PENDING]: [ProposalStatus.ACTIVE, ProposalStatus.CANCELLED],
  [ProposalStatus.ACTIVE]: [
    ProposalStatus.PASSED,
    ProposalStatus.FAILED,
    ProposalStatus.CANCELLED,
  ],
  [ProposalStatus.PASSED]: [ProposalStatus.QUEUED, ProposalStatus.CANCELLED],
  [ProposalStatus.QUEUED]: [ProposalStatus.EXECUTED, ProposalStatus.CANCELLED],
  [ProposalStatus.EXECUTED]: [],
  [ProposalStatus.FAILED]: [],
  [ProposalStatus.CANCELLED]: [],
};

@Injectable()
export class ProposalLifecycleService {
  private readonly logger = new Logger(ProposalLifecycleService.name);

  constructor(
    @InjectRepository(GovernanceProposal)
    private readonly proposalRepo: Repository<GovernanceProposal>,
    @InjectRepository(Vote)
    private readonly voteRepo: Repository<Vote>,
    @InjectRepository(ProposalTransition)
    private readonly transitionRepo: Repository<ProposalTransition>,
    private readonly stellarService: StellarService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Voting Window Enforcement ────────────────────────────────────────────

  /**
   * Asserts that the current ledger falls within the proposal's voting window.
   * Call this immediately before recording a vote to prevent votes before
   * `startBlock` or after `endBlock`.
   */
  async assertValidVotingWindow(proposal: GovernanceProposal): Promise<void> {
    if (proposal.startBlock === null || proposal.endBlock === null) {
      throw new BadRequestException(
        'This proposal has no configured voting window',
      );
    }

    const currentLedger = await this.getCurrentLedger();

    if (currentLedger < proposal.startBlock) {
      throw new BadRequestException(
        `Voting has not started yet — opens at ledger ${proposal.startBlock} (current: ${currentLedger})`,
      );
    }

    if (currentLedger > proposal.endBlock) {
      throw new BadRequestException(
        `Voting window is closed — ended at ledger ${proposal.endBlock} (current: ${currentLedger})`,
      );
    }
  }

  // ─── Finalization (ACTIVE → PASSED / FAILED) ──────────────────────────────

  /**
   * Evaluate quorum and participation once the voting window closes and
   * transition the proposal to PASSED or FAILED.
   *
   * Rules:
   *  - `totalWeight` (FOR + AGAINST + ABSTAIN) must reach `requiredQuorum`
   *  - `forWeight` must strictly exceed `againstWeight`
   *
   * Abstain votes count toward quorum participation but not toward the
   * FOR/AGAINST decision.
   */
  async finalizeVoting(
    proposalId: string,
    triggeredBy = 'system',
  ): Promise<GovernanceProposal> {
    const proposal = await this.proposalRepo.findOneBy({ id: proposalId });
    if (!proposal) {
      throw new NotFoundException(`Proposal ${proposalId} not found`);
    }

    if (proposal.status !== ProposalStatus.ACTIVE) {
      throw new BadRequestException(
        `Proposal cannot be finalized from status "${proposal.status}" — only ACTIVE proposals can be finalized`,
      );
    }

    const currentLedger = await this.getCurrentLedger();
    if (
      proposal.endBlock !== null &&
      currentLedger <= Number(proposal.endBlock)
    ) {
      throw new BadRequestException(
        `Voting window has not closed yet — end block ${proposal.endBlock}, current ledger ${currentLedger}`,
      );
    }

    const tally = await this.computeWeightedTally(proposal.id);
    const requiredQuorum = parseFloat(proposal.requiredQuorum);
    const quorumMet = tally.totalWeight >= requiredQuorum;
    const majorityFor = tally.forWeight > tally.againstWeight;
    const passed = quorumMet && majorityFor;

    const newStatus = passed ? ProposalStatus.PASSED : ProposalStatus.FAILED;
    const reason = this.buildFinalizationReason(
      tally,
      requiredQuorum,
      quorumMet,
      majorityFor,
    );

    await this.transitionTo(proposal, newStatus, {
      triggeredBy,
      reason,
      metadata: {
        tally,
        requiredQuorum,
        quorumMet,
        majorityFor,
        finalizedAtLedger: currentLedger,
      },
    });

    this.logger.log(
      `Proposal ${proposal.onChainId} finalized → ${newStatus} (${reason})`,
    );

    return proposal;
  }

  // ─── Quorum Re-verification at Queue Time ─────────────────────────────────

  /**
   * Re-verify that a PASSED proposal actually met quorum before it enters the
   * timelock queue. Guards against edge cases where the PASSED status was set
   * externally (e.g. indexer) without a quorum check.
   */
  async verifyQuorumForQueue(proposal: GovernanceProposal): Promise<void> {
    const tally = await this.computeWeightedTally(proposal.id);
    const requiredQuorum = parseFloat(proposal.requiredQuorum);
    const quorumMet = tally.totalWeight >= requiredQuorum;
    const majorityFor = tally.forWeight > tally.againstWeight;

    if (!quorumMet) {
      throw new BadRequestException(
        `Proposal cannot be queued: quorum not met ` +
          `(total weight ${tally.totalWeight.toFixed(4)}, required ${requiredQuorum.toFixed(4)} NST)`,
      );
    }

    if (!majorityFor) {
      throw new BadRequestException(
        `Proposal cannot be queued: majority FOR not achieved ` +
          `(FOR ${tally.forWeight.toFixed(4)} vs AGAINST ${tally.againstWeight.toFixed(4)} NST)`,
      );
    }
  }

  // ─── State Machine Gateway ────────────────────────────────────────────────

  /**
   * The single choke-point for every proposal state change.
   *
   * 1. Validates the transition is allowed by the state machine.
   * 2. Applies the new status to the proposal and persists it.
   * 3. Writes an immutable `ProposalTransition` audit record.
   * 4. Emits `governance.proposal.transition` for real-time subscribers.
   *
   * Callers are responsible for setting any additional fields on `proposal`
   * (e.g. `timelockEndsAt`, `executedAt`) before calling this method.
   */
  async transitionTo(
    proposal: GovernanceProposal,
    newStatus: ProposalStatus,
    opts: TransitionOptions = {},
  ): Promise<GovernanceProposal> {
    const fromStatus = proposal.status;
    const allowed = ALLOWED_TRANSITIONS[fromStatus] ?? [];

    if (!allowed.includes(newStatus)) {
      const allowedStr = allowed.length > 0 ? allowed.join(', ') : 'none';
      throw new BadRequestException(
        `Invalid state transition: ${fromStatus} → ${newStatus}. ` +
          `Allowed from ${fromStatus}: ${allowedStr}`,
      );
    }

    proposal.status = newStatus;
    await this.proposalRepo.save(proposal);

    const transition = this.transitionRepo.create({
      proposalId: proposal.id,
      fromStatus,
      toStatus: newStatus,
      triggeredBy: opts.triggeredBy ?? null,
      reason: opts.reason ?? null,
      metadata: opts.metadata ?? null,
    });
    await this.transitionRepo.save(transition);

    this.eventEmitter.emit('governance.proposal.transition', {
      proposalId: proposal.id,
      onChainId: proposal.onChainId,
      fromStatus,
      toStatus: newStatus,
      triggeredBy: opts.triggeredBy ?? null,
    });

    return proposal;
  }

  // ─── Audit Trail ──────────────────────────────────────────────────────────

  async getTransitionHistory(proposalId: string): Promise<ProposalTransition[]> {
    const proposal = await this.proposalRepo.findOneBy({ id: proposalId });
    if (!proposal) {
      throw new NotFoundException(`Proposal ${proposalId} not found`);
    }
    return this.transitionRepo.find({
      where: { proposalId },
      order: { transitionedAt: 'ASC' },
    });
  }

  // ─── Scheduled Auto-finalization ──────────────────────────────────────────

  /**
   * Runs every 30 seconds to auto-finalize any ACTIVE proposals whose
   * voting window has closed on-chain. This ensures proposals are not left
   * in an indefinite ACTIVE state if no user manually triggers finalization.
   */
  @Cron('*/30 * * * * *')
  async sweepExpiredProposals(): Promise<void> {
    const activeProposals = await this.proposalRepo.find({
      where: { status: ProposalStatus.ACTIVE },
    });

    if (activeProposals.length === 0) return;

    let currentLedger: number;
    try {
      currentLedger = await this.getCurrentLedger();
    } catch {
      this.logger.warn(
        'Auto-finalize skipped: Stellar RPC unavailable this tick',
      );
      return;
    }

    for (const proposal of activeProposals) {
      if (proposal.endBlock === null) continue;
      if (currentLedger <= Number(proposal.endBlock)) continue;

      try {
        await this.finalizeVoting(proposal.id, 'system');
      } catch (err) {
        this.logger.error(
          `Auto-finalize failed for proposal ${proposal.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ─── Vote Tally Helper ────────────────────────────────────────────────────

  async computeWeightedTally(proposalId: string): Promise<WeightedTally> {
    const votes = await this.voteRepo.find({ where: { proposalId } });

    let forWeight = 0;
    let againstWeight = 0;
    let abstainWeight = 0;

    for (const vote of votes) {
      const w = Number(vote.weight) || 0;
      if (vote.direction === VoteDirection.FOR) forWeight += w;
      else if (vote.direction === VoteDirection.AGAINST) againstWeight += w;
      else abstainWeight += w;
    }

    return {
      forWeight,
      againstWeight,
      abstainWeight,
      totalWeight: forWeight + againstWeight + abstainWeight,
      totalVoters: votes.length,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async getCurrentLedger(): Promise<number> {
    try {
      const latestLedger = await this.stellarService
        .getRpcServer()
        .getLatestLedger();
      const sequence = Number(latestLedger?.sequence);
      if (!Number.isFinite(sequence) || sequence <= 0) {
        throw new Error('Invalid ledger sequence');
      }
      return sequence;
    } catch (error) {
      throw new ServiceUnavailableException(
        `Unable to resolve latest ledger: ${(error as Error).message}`,
      );
    }
  }

  private buildFinalizationReason(
    tally: WeightedTally,
    requiredQuorum: number,
    quorumMet: boolean,
    majorityFor: boolean,
  ): string {
    if (!quorumMet) {
      return (
        `Failed: quorum not met ` +
        `(${tally.totalWeight.toFixed(4)} / ${requiredQuorum.toFixed(4)} NST required, ` +
        `${tally.totalVoters} voter(s))`
      );
    }
    if (!majorityFor) {
      return (
        `Failed: majority FOR not achieved ` +
        `(FOR ${tally.forWeight.toFixed(4)} ≤ AGAINST ${tally.againstWeight.toFixed(4)} NST)`
      );
    }
    return (
      `Passed: quorum met and majority FOR ` +
      `(FOR ${tally.forWeight.toFixed(4)} vs AGAINST ${tally.againstWeight.toFixed(4)}, ` +
      `total ${tally.totalWeight.toFixed(4)} / ${requiredQuorum.toFixed(4)} NST required, ` +
      `${tally.totalVoters} voter(s))`
    );
  }
}
