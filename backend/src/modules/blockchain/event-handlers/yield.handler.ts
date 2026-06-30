import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { scValToNative, xdr } from '@stellar/stellar-sdk';
import {
  LedgerTransaction,
  LedgerTransactionStatus,
  LedgerTransactionType,
} from '../entities/transaction.entity';
import {
  SubscriptionStatus,
  UserSubscription,
} from '../../savings/entities/user-subscription.entity';
import { User } from '../../user/entities/user.entity';
import { SavingsProduct } from '../../savings/entities/savings-product.entity';
import { TransactionStateMachineService } from '../../transactions/transaction-state-machine.service';
import {
  BlockchainEventParser,
  RawBlockchainEvent,
} from '../blockchain-event-parser.service';
import { QuarantineReason } from '../entities/malformed-blockchain-event.entity';

@Injectable()
export class YieldHandler {
  private readonly logger = new Logger(YieldHandler.name);
  private static readonly YIELD_HASH_HEX = createHash('sha256')
    .update('Yield')
    .digest('hex');

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly transactionStateMachine: TransactionStateMachineService,
    private readonly eventParser: BlockchainEventParser,
  ) {}

  async handle(event: RawBlockchainEvent): Promise<boolean> {
    if (!this.isYieldTopic(event.topic)) {
      return false;
    }

    // ── Structural validation ────────────────────────────────────────────────
    const structuralFailure = this.eventParser.validateEventStructure(event);
    if (structuralFailure) {
      await this.eventParser.quarantineEvent(
        event,
        structuralFailure.reason,
        structuralFailure.errorDetails,
        'Yield',
      );
      return true;
    }

    // ── Payload parsing ──────────────────────────────────────────────────────
    const parseResult = this.eventParser.parseStandardPayload(event, {
      eventType: 'Yield',
      publicKeyFields: ['publicKey', 'userPublicKey', 'user', 'address'],
      amountFields: [
        'amount',
        'yield',
        'interest',
        'user_yield',
        'actual_yield',
        'payout',
      ],
    });

    if (!parseResult.ok) {
      await this.eventParser.quarantineEvent(
        event,
        parseResult.reason,
        parseResult.errorDetails,
        'Yield',
      );
      return true;
    }

    const { publicKey, amount, eventId, txHash, ledgerSequence, rawMeta } =
      parseResult.payload;

    // ── Business logic ───────────────────────────────────────────────────────
    try {
      await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);
        const txRepo = manager.getRepository(LedgerTransaction);
        const subRepo = manager.getRepository(UserSubscription);

        const user = await userRepo.findOne({
          where: [
            { publicKey },
            { walletAddress: publicKey },
          ],
        });

        if (!user) {
          throw new Error(
            `Cannot map yield publicKey to user: ${publicKey}`,
          );
        }

        const existingTx = await txRepo.findOne({ where: { eventId } });
        if (existingTx) {
          this.logger.debug(
            `Yield event ${eventId} already persisted. Skipping.`,
          );
          return;
        }

        const createdTx = await this.transactionStateMachine.createTransaction(
          {
            userId: user.id,
            type: LedgerTransactionType.YIELD,
            amount,
            publicKey,
            eventId,
            txHash,
            ledgerSequence,
            metadata: rawMeta,
          },
          {
            manager,
            actor: 'blockchain-indexer',
            reason: 'Yield event ingested',
            metadata: { eventId },
          },
        );
        await this.transactionStateMachine.transitionStatus(
          createdTx.id,
          LedgerTransactionStatus.PENDING_CONFIRMATION,
          { manager, actor: 'blockchain-indexer', reason: 'Yield pending confirmation' },
        );
        await this.transactionStateMachine.transitionStatus(
          createdTx.id,
          LedgerTransactionStatus.CONFIRMED,
          { manager, actor: 'blockchain-indexer', reason: 'Yield confirmed on ledger' },
        );
        await this.transactionStateMachine.transitionStatus(
          createdTx.id,
          LedgerTransactionStatus.COMPLETED,
          { manager, actor: 'blockchain-indexer', reason: 'Yield workflow completed' },
        );

        const subscription = await subRepo.findOne({
          where: { userId: user.id, status: SubscriptionStatus.ACTIVE },
          order: { createdAt: 'DESC' },
        });

        if (subscription) {
          await manager.increment(
            UserSubscription,
            { id: subscription.id },
            'totalInterestEarned',
            Number(amount),
          );
        } else {
          this.logger.warn(
            `No active subscription found for user ${user.id} to apply yield to.`,
          );
        }
      });
    } catch (err) {
      await this.eventParser.quarantineEvent(
        event,
        QuarantineReason.HANDLER_ERROR,
        (err as Error).message,
        'Yield',
      );
    }

    return true;
  }

  // ─── Topic detection ──────────────────────────────────────────────────────

  private isYieldTopic(topic: unknown): boolean {
    if (!Array.isArray(topic) || topic.length === 0) {
      return false;
    }

    const first = topic[0];
    const normalized = this.toHex(first);

    const YLD_DIST_HASH_HEX = createHash('sha256').update('yld_dist').digest('hex');
    const YIELD_PAYOUT_HASH_HEX = createHash('sha256').update('YieldPayout').digest('hex');

    if (
      normalized === YieldHandler.YIELD_HASH_HEX ||
      normalized === YLD_DIST_HASH_HEX ||
      normalized === YIELD_PAYOUT_HASH_HEX
    ) {
      return true;
    }

    if (typeof first === 'string') {
      try {
        const scVal = xdr.ScVal.fromXDR(first, 'base64');
        const symbol = scValToNative(scVal);
        return (
          symbol === 'Yield' ||
          symbol === 'YieldPayout' ||
          symbol === 'yld_dist'
        );
      } catch {
        // Not XDR, ignore
      }
    }

    return false;
  }

  private toHex(topicPart: unknown): string | null {
    if (typeof topicPart === 'string') {
      const clean = topicPart.toLowerCase().replace(/^0x/, '');
      if (/^[0-9a-f]{64}$/i.test(clean)) {
        return clean;
      }
      try {
        return Buffer.from(topicPart, 'base64').toString('hex');
      } catch {
        return null;
      }
    }

    if (
      topicPart &&
      typeof topicPart === 'object' &&
      'toXDR' in topicPart &&
      typeof (topicPart as { toXDR?: unknown }).toXDR === 'function'
    ) {
      try {
        const base64 = (topicPart as { toXDR: (enc?: string) => string }).toXDR('base64');
        return Buffer.from(base64, 'base64').toString('hex');
      } catch {
        return null;
      }
    }

    return null;
  }
}
