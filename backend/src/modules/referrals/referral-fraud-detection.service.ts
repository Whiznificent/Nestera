import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Referral } from './entities/referral.entity';
import { ReferralFraudAudit } from './entities/referral-fraud-audit.entity';
import {
  ReferralFraudEvaluationContext,
  ReferralFraudEvaluationResult,
  ReferralFraudReason,
} from './referral-fraud.types';
import { ReferralStatus } from './entities/referral.entity';
import {
  Transaction,
  TxType,
} from '../transactions/entities/transaction.entity';
import { AuditLogService } from '../../common/services/audit-log.service';
import {
  AuditAction,
  AuditResourceType,
} from '../../common/entities/audit-log.entity';

@Injectable()
export class ReferralFraudDetectionService {
  private readonly logger = new Logger(ReferralFraudDetectionService.name);
  private readonly creationAttempts = new Map<string, number[]>();

  constructor(
    @InjectRepository(Referral)
    private readonly referralRepository: Repository<Referral>,
    @InjectRepository(ReferralFraudAudit)
    private readonly fraudAuditRepository: Repository<ReferralFraudAudit>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {}

  buildMetadataFingerprint(
    context: ReferralFraudEvaluationContext,
  ): string | null {
    return this.metadataFingerprint(context);
  }

  enforceCreationRateLimit(referrerId: string): void {
    const windowMs = this.configService.get<number>(
      'referralFraud.creationRateWindowMs',
      3_600_000,
    );
    const maxAttempts = this.configService.get<number>(
      'referralFraud.maxCreationAttemptsPerWindow',
      20,
    );

    const now = Date.now();
    const attempts = (this.creationAttempts.get(referrerId) ?? []).filter(
      (ts) => now - ts <= windowMs,
    );

    if (attempts.length >= maxAttempts) {
      throw new HttpException(
        'Referral creation rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    attempts.push(now);
    this.creationAttempts.set(referrerId, attempts);
  }

  async evaluateReferral(
    referral: Referral,
    context: ReferralFraudEvaluationContext = {},
  ): Promise<ReferralFraudEvaluationResult> {
    const reasons: ReferralFraudReason[] = [];
    const metadata: Record<string, unknown> = { context };

    if (referral.referrerId === referral.refereeId) {
      reasons.push(ReferralFraudReason.SELF_REFERRAL);
    }

    const similarMetadata = await this.detectSimilarMetadata(referral, context);
    if (similarMetadata) {
      reasons.push(ReferralFraudReason.SIMILAR_METADATA);
      metadata.similarMetadata = similarMetadata;
    }

    const suspiciousSignup = await this.detectSuspiciousSignupPattern(referral);
    if (suspiciousSignup) {
      reasons.push(ReferralFraudReason.SUSPICIOUS_SIGNUP_PATTERN);
      metadata.suspiciousSignup = suspiciousSignup;
    }

    const excessiveCreation = await this.detectExcessiveReferralCreation(
      referral.referrerId,
    );
    if (excessiveCreation) {
      reasons.push(ReferralFraudReason.EXCESSIVE_CREATION);
      metadata.excessiveCreation = excessiveCreation;
    }

    if (referral.refereeId) {
      const withdrawalPattern = await this.detectSuspiciousWithdrawal(
        referral.refereeId,
      );
      if (withdrawalPattern) {
        reasons.push(ReferralFraudReason.SUSPICIOUS_WITHDRAWAL);
        metadata.withdrawalPattern = withdrawalPattern;
      }
    }

    const isSuspicious = reasons.length > 0;
    return {
      isSuspicious,
      reasons,
      metadata,
      shouldQuarantine: isSuspicious,
    };
  }

  async quarantineReferral(
    referral: Referral,
    evaluation: ReferralFraudEvaluationResult,
    actor = 'system',
  ): Promise<Referral> {
    referral.status = ReferralStatus.QUARANTINED;
    referral.fraudReasons = evaluation.reasons;
    referral.quarantinedAt = new Date();
    referral.requiresManualReview = true;

    const saved = await this.referralRepository.save(referral);

    const rationale = this.buildRationale(evaluation.reasons);
    await this.fraudAuditRepository.save(
      this.fraudAuditRepository.create({
        referralId: referral.id,
        referrerId: referral.referrerId,
        refereeId: referral.refereeId,
        reasons: evaluation.reasons,
        decisionMetadata: evaluation.metadata,
        rationale,
        action: 'quarantine',
        actor,
      }),
    );

    await this.auditLogService.log({
      action: AuditAction.UPDATE,
      resourceType: AuditResourceType.USER,
      resourceId: referral.id,
      actor,
      description: 'Referral quarantined by fraud detection',
      previousValue: { status: ReferralStatus.PENDING },
      newValue: {
        status: ReferralStatus.QUARANTINED,
        reasons: evaluation.reasons,
        rationale,
      },
      success: true,
    });

    this.logger.warn(
      `Referral ${referral.id} quarantined: ${evaluation.reasons.join(', ')}`,
    );

    return saved;
  }

  private buildRationale(reasons: ReferralFraudReason[]): string {
    return reasons
      .map((reason) => {
        switch (reason) {
          case ReferralFraudReason.SELF_REFERRAL:
            return 'Referrer and referee resolve to the same user';
          case ReferralFraudReason.SIMILAR_METADATA:
            return 'Referral metadata closely matches prior suspicious attempts';
          case ReferralFraudReason.SUSPICIOUS_SIGNUP_PATTERN:
            return 'Referee signup pattern matches known abuse heuristics';
          case ReferralFraudReason.EXCESSIVE_CREATION:
            return 'Referrer exceeded configurable referral creation threshold';
          case ReferralFraudReason.RATE_LIMIT_EXCEEDED:
            return 'Referral creation rate limit exceeded';
          case ReferralFraudReason.SUSPICIOUS_WITHDRAWAL:
            return 'Referee exhibited deposit-then-immediate-withdrawal pattern';
          default:
            return reason;
        }
      })
      .join('; ');
  }

  private metadataFingerprint(
    context: ReferralFraudEvaluationContext,
  ): string | null {
    const parts = [
      context.ipAddress,
      context.userAgent,
      context.deviceFingerprint,
      context.signupSource,
    ].filter(Boolean);

    if (parts.length === 0) {
      return null;
    }

    return createHash('sha256').update(parts.join('|')).digest('hex');
  }

  private async detectSimilarMetadata(
    referral: Referral,
    context: ReferralFraudEvaluationContext,
  ): Promise<Record<string, unknown> | null> {
    const fingerprint = this.metadataFingerprint(context);
    if (!fingerprint) {
      return null;
    }

    const windowMs = this.configService.get<number>(
      'referralFraud.similarMetadataWindowMs',
      7 * 24 * 60 * 60 * 1000,
    );
    const threshold = this.configService.get<number>(
      'referralFraud.similarMetadataThreshold',
      2,
    );

    const since = new Date(Date.now() - windowMs);
    const recentReferrals = await this.referralRepository.find({
      where: {
        referrerId: referral.referrerId,
        createdAt: MoreThan(since),
      },
    });

    const matches = recentReferrals.filter((item) => {
      const storedFingerprint = item.metadata?.fingerprint as
        string | undefined;
      return storedFingerprint === fingerprint && item.id !== referral.id;
    });

    if (matches.length >= threshold) {
      return { fingerprint, matchCount: matches.length + 1 };
    }

    return null;
  }

  private async detectSuspiciousSignupPattern(
    referral: Referral,
  ): Promise<Record<string, unknown> | null> {
    const windowMs = this.configService.get<number>(
      'referralFraud.signupPatternWindowMs',
      24 * 60 * 60 * 1000,
    );
    const threshold = this.configService.get<number>(
      'referralFraud.signupPatternThreshold',
      5,
    );

    const recentCount = await this.referralRepository.count({
      where: {
        referrerId: referral.referrerId,
        createdAt: MoreThan(new Date(Date.now() - windowMs)),
      },
    });

    if (recentCount >= threshold) {
      return { recentCount, windowMs, threshold };
    }

    return null;
  }

  private async detectExcessiveReferralCreation(
    referrerId: string,
  ): Promise<Record<string, unknown> | null> {
    const windowMs = this.configService.get<number>(
      'referralFraud.excessiveCreationWindowMs',
      24 * 60 * 60 * 1000,
    );
    const threshold = this.configService.get<number>(
      'referralFraud.excessiveCreationThreshold',
      10,
    );

    const count = await this.referralRepository.count({
      where: {
        referrerId,
        createdAt: MoreThan(new Date(Date.now() - windowMs)),
      },
    });

    if (count > threshold) {
      return { count, threshold, windowMs };
    }

    return null;
  }

  private async detectSuspiciousWithdrawal(
    refereeId: string,
  ): Promise<Record<string, unknown> | null> {
    const transactions = await this.transactionRepository.find({
      where: { userId: refereeId },
    });

    const deposits = transactions.filter((t) => t.type === TxType.DEPOSIT);
    const withdrawals = transactions.filter((t) => t.type === TxType.WITHDRAW);

    if (deposits.length === 1 && withdrawals.length > 0) {
      const timeDiff =
        new Date(withdrawals[0].createdAt).getTime() -
        new Date(deposits[0].createdAt).getTime();
      const maxDiffMs = this.configService.get<number>(
        'referralFraud.suspiciousWithdrawalWindowMs',
        60 * 60 * 1000,
      );

      if (timeDiff < maxDiffMs) {
        return { timeDiffMs: timeDiff, maxDiffMs };
      }
    }

    return null;
  }
}
