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
import { TransactionStateMachineService } from '../../transactions/transaction-state-machine.service';
import { ContractEventValidatorService } from '../contract-event-validator.service';

interface IndexerEvent {
  id?: string;
  topic?: unknown[];
  value?: unknown;
  txHash?: string;
  ledger?: number;
  [key: string]: unknown;
}

interface WithdrawPayload {
  publicKey: string;
  amount: string;
}

@Injectable()
export class WithdrawHandler {
  private readonly logger = new Logger(WithdrawHandler.name);
  private static readonly WITHDRAW_HASH_HEX = createHash('sha256')
    .update('Withdraw')
    .digest('hex');

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly transactionStateMachine: TransactionStateMachineService,
    private readonly contractEventValidator: ContractEventValidatorService,
  ) {}

  async handle(event: IndexerEvent): Promise<boolean> {
    if (!this.isWithdrawTopic(event.topic)) {
      return false;
    }

    const eventId = this.resolveEventId(event);
    const ledgerSequence =
      typeof event.ledger === 'number' ? event.ledger : null;
    const contractId =
      typeof event.contractId === 'string' ? event.contractId : null;
    const validationCtx = {
      handlerName: 'WithdrawHandler',
      eventId,
      ledgerSequence,
      contractId,
    };

    // Validate the raw event envelope before any decoding
    this.contractEventValidator.validateEnvelope(event, validationCtx);

    let payload: WithdrawPayload;
    try {
      payload = this.extractPayload(event.value);
    } catch (err) {
      this.logger.error('WithdrawHandler: failed to extract payload', {
        handlerName: 'WithdrawHandler',
        eventId,
        ledgerSequence,
        error: (err as Error).message,
      });
      throw err;
    }

    // Validate the decoded payload against the Withdraw schema
    this.contractEventValidator.validatePayload(
      'Withdraw',
      payload as unknown as Record<string, unknown>,
      validationCtx,
    );

    await this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const txRepo = manager.getRepository(LedgerTransaction);
      const subRepo = manager.getRepository(UserSubscription);

      const user = await userRepo.findOne({
        where: [
          { publicKey: payload.publicKey },
          { walletAddress: payload.publicKey },
        ],
      });

      if (!user) {
        const msg = `Cannot map withdraw payload publicKey to user: ${payload.publicKey}`;
        this.logger.error('WithdrawHandler: user resolution failed', {
          handlerName: 'WithdrawHandler',
          eventId,
          ledgerSequence,
          error: msg,
        });
        throw new Error(msg);
      }

      const existingTx = await txRepo.findOne({ where: { eventId } });
      if (existingTx) {
        this.logger.debug(
          `Withdraw event ${eventId} already persisted. Skipping.`,
        );
        return;
      }

      const createdTx = await this.transactionStateMachine.createTransaction(
        {
          userId: user.id,
          type: LedgerTransactionType.WITHDRAW,
          amount: payload.amount,
          publicKey: payload.publicKey,
          eventId,
          txHash: typeof event.txHash === 'string' ? event.txHash : null,
          ledgerSequence:
            typeof event.ledger === 'number' ? String(event.ledger) : null,
          metadata: {
            topic: event.topic,
            rawValueType: typeof event.value,
          },
        },
        {
          manager,
          actor: 'blockchain-indexer',
          reason: 'Withdraw event ingested',
          metadata: { eventId },
        },
      );
      await this.transactionStateMachine.transitionStatus(
        createdTx.id,
        LedgerTransactionStatus.PENDING_CONFIRMATION,
        {
          manager,
          actor: 'blockchain-indexer',
          reason: 'Withdraw pending confirmation',
        },
      );
      await this.transactionStateMachine.transitionStatus(
        createdTx.id,
        LedgerTransactionStatus.CONFIRMED,
        {
          manager,
          actor: 'blockchain-indexer',
          reason: 'Withdraw confirmed on ledger',
        },
      );
      await this.transactionStateMachine.transitionStatus(
        createdTx.id,
        LedgerTransactionStatus.COMPLETED,
        {
          manager,
          actor: 'blockchain-indexer',
          reason: 'Withdraw workflow completed',
        },
      );

      const amountAsNumber = Number(payload.amount);

      const subscription = await subRepo.findOne({
        where: {
          userId: user.id,
          status: SubscriptionStatus.ACTIVE,
        },
        order: { createdAt: 'DESC' },
      });

      if (!subscription) {
        const msg = `No active subscription found for user ${user.id} to decrement withdrawal`;
        this.logger.error('WithdrawHandler: no active subscription', {
          handlerName: 'WithdrawHandler',
          eventId,
          ledgerSequence,
          userId: user.id,
          error: msg,
        });
        throw new Error(msg);
      }

      // Decrement the amount natively in the database to ensure atomicity and precision
      await manager.decrement(
        UserSubscription,
        { id: subscription.id },
        'amount',
        amountAsNumber,
      );
    });

    return true;
  }

  private isWithdrawTopic(topic: unknown[] | undefined): boolean {
    if (!Array.isArray(topic) || topic.length === 0) {
      return false;
    }

    const first = topic[0];
    const normalized = this.toHex(first);

    // Some contracts emit the symbol 'Withdraw' directly, others emit its SHA256 hash
    if (normalized === WithdrawHandler.WITHDRAW_HASH_HEX) {
      return true;
    }

    // Check if it's the symbol 'Withdraw' (XDR encoded)
    if (typeof first === 'string') {
      try {
        const scVal = xdr.ScVal.fromXDR(first, 'base64');
        if (scValToNative(scVal) === 'Withdraw') {
          return true;
        }
      } catch {
        // Not XDR, ignore
      }
    }

    return false;
  }

  private extractPayload(value: unknown): WithdrawPayload {
    const decoded = this.decodeScVal(value);
    const asRecord = this.ensureObject(decoded);

    const publicKey =
      this.pickString(asRecord, [
        'publicKey',
        'userPublicKey',
        'user',
        'address',
        'to',
        'from',
      ]) ?? '';
    const amountRaw =
      asRecord['amount'] ?? asRecord['value'] ?? asRecord['amt'];

    const amount =
      typeof amountRaw === 'bigint'
        ? amountRaw.toString()
        : typeof amountRaw === 'number'
          ? String(amountRaw)
          : typeof amountRaw === 'string'
            ? amountRaw
            : '';

    if (!publicKey || !amount || Number.isNaN(Number(amount))) {
      throw new Error(
        'Invalid Withdraw payload: expected publicKey + numeric amount',
      );
    }

    return { publicKey, amount };
  }

  private resolveEventId(event: IndexerEvent): string {
    if (typeof event.id === 'string' && event.id.length > 0) {
      return event.id;
    }

    const txHash = typeof event.txHash === 'string' ? event.txHash : 'unknown';
    const ledger = typeof event.ledger === 'number' ? event.ledger : 0;
    return `${txHash}:${ledger}:withdraw`;
  }

  private decodeScVal(value: unknown): unknown {
    if (
      value &&
      typeof value === 'object' &&
      'toXDR' in value &&
      typeof (value as { toXDR?: unknown }).toXDR === 'function'
    ) {
      const base64 = (value as { toXDR: (encoding?: string) => string }).toXDR(
        'base64',
      );
      const scVal = xdr.ScVal.fromXDR(base64, 'base64');
      return scValToNative(scVal);
    }

    if (typeof value === 'string') {
      try {
        const scVal = xdr.ScVal.fromXDR(value, 'base64');
        return scValToNative(scVal);
      } catch {
        return value;
      }
    }

    return value;
  }

  private ensureObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    throw new Error('Unexpected Withdraw payload shape.');
  }

  private pickString(
    record: Record<string, unknown>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }

    return null;
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
        const base64 = (
          topicPart as { toXDR: (encoding?: string) => string }
        ).toXDR('base64');
        return Buffer.from(base64, 'base64').toString('hex');
      } catch {
        return null;
      }
    }

    return null;
  }
}
