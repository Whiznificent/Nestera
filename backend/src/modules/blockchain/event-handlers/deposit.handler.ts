import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { scValToNative, xdr } from '@stellar/stellar-sdk';
import {
  LedgerTransaction,
  LedgerTransactionType,
  LedgerTransactionStatus,
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
export class DepositHandler {
  private readonly logger = new Logger(DepositHandler.name);
  private static readonly DEPOSIT_HASH_HEX = createHash('sha256')
    .update('Deposit')
    .digest('hex');

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly transactionStateMachine: TransactionStateMachineService,
    private readonly eventParser: BlockchainEventParser,
  ) {}

  async handle(event: RawBlockchainEvent): Promise<boolean> {
    if (!this.isDepositTopic(event.topic)) {
      return false;
    }

    // ── Structural validation ────────────────────────────────────────────────
    const structuralFailure = this.eventParser.validateEventStructure(event);
    if (structuralFailure) {
      await this.eventParser.quarantineEvent(
        event,
        structuralFailure.reason,
        structuralFailure.errorDetails,
        'Deposit',
      );
      return true; // Event was ours — we handled it by quarantining
    }

    // ── Payload parsing ──────────────────────────────────────────────────────
    const parseResult = this.eventParser.parseStandardPayload(event, {
      eventType: 'Deposit',
      publicKeyFields: ['publicKey', 'userPublicKey', 'user', 'address', 'to'],
      amountFields: ['amount', 'value', 'amt'],
    });

    if (!parseResult.ok) {
      await this.eventParser.quarantineEvent(
        event,
        parseResult.reason,
        parseResult.errorDetails,
        'Deposit',
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
        const productRepo = manager.getRepository(SavingsProduct);

        const user = await userRepo.findOne({
          where: [
            { publicKey },
            { walletAddress: publicKey },
          ],
        });

        if (!user) {
          throw new Error(
            `Cannot map deposit publicKey to user: ${publicKey}`,
          );
        }

        const existingTx = await txRepo.findOne({ where: { eventId } });
        if (existingTx) {
          this.logger.debug(
            `Deposit event ${eventId} already persisted. Skipping.`,
          );
          return;
        }

        const createdTx = await this.transactionStateMachine.createTransaction(
          {
            userId: user.id,
            type: LedgerTransactionType.DEPOSIT,
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
            reason: 'Deposit event ingested',
            metadata: { eventId },
          },
        );
        await this.transactionStateMachine.transitionStatus(
          createdTx.id,
          LedgerTransactionStatus.PENDING_CONFIRMATION,
          { manager, actor: 'blockchain-indexer', reason: 'Deposit pending confirmation' },
        );
        await this.transactionStateMachine.transitionStatus(
          createdTx.id,
          LedgerTransactionStatus.CONFIRMED,
          { manager, actor: 'blockchain-indexer', reason: 'Deposit confirmed on ledger' },
        );
        await this.transactionStateMachine.transitionStatus(
          createdTx.id,
          LedgerTransactionStatus.COMPLETED,
          { manager, actor: 'blockchain-indexer', reason: 'Deposit workflow completed' },
        );

        const amountAsNumber = Number(amount);

        let subscription = await subRepo.findOne({
          where: { userId: user.id, status: SubscriptionStatus.ACTIVE },
          order: { createdAt: 'DESC' },
        });

        if (!subscription) {
          const defaultProduct = user.defaultSavingsProductId
            ? await productRepo.findOne({
                where: { id: user.defaultSavingsProductId },
              })
            : await productRepo.findOne({
                where: { isActive: true },
                order: { createdAt: 'ASC' },
              });

          if (!defaultProduct) {
            throw new Error(
              'No savings product found to create subscription aggregate.',
            );
          }

          subscription = subRepo.create({
            userId: user.id,
            productId: defaultProduct.id,
            amount: amountAsNumber,
            status: SubscriptionStatus.ACTIVE,
            startDate: new Date(),
            endDate: null,
          });
        } else {
          subscription.amount = Number(subscription.amount) + amountAsNumber;
        }

        await subRepo.save(subscription);
      });
    } catch (err) {
      // Business logic errors — quarantine with HANDLER_ERROR so the event
      // appears in the quarantine triage queue but does not crash the indexer.
      await this.eventParser.quarantineEvent(
        event,
        QuarantineReason.HANDLER_ERROR,
        (err as Error).message,
        'Deposit',
      );
    }

    return true;
  }

  // ─── Topic detection ──────────────────────────────────────────────────────

  private isDepositTopic(topic: unknown): boolean {
    if (!Array.isArray(topic) || topic.length === 0) {
      return false;
    }

    const first = topic[0];
    const normalized = this.toHex(first);

    if (normalized === DepositHandler.DEPOSIT_HASH_HEX) {
      return true;
    }

    if (typeof first === 'string') {
      try {
        const scVal = xdr.ScVal.fromXDR(first, 'base64');
        if (scValToNative(scVal) === 'Deposit') {
          return true;
        }
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
