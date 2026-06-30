import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ReferralFraudDetectionService } from './referral-fraud-detection.service';
import { Referral, ReferralStatus } from './entities/referral.entity';
import { ReferralFraudAudit } from './entities/referral-fraud-audit.entity';
import {
  Transaction,
  TxType,
} from '../transactions/entities/transaction.entity';
import { AuditLogService } from '../../common/services/audit-log.service';
import { ReferralFraudReason } from './referral-fraud.types';

describe('ReferralFraudDetectionService', () => {
  let service: ReferralFraudDetectionService;
  let referralRepo: any;
  let fraudAuditRepo: any;
  let transactionRepo: any;

  const referral: Referral = {
    id: 'ref-1',
    referrerId: 'user-1',
    refereeId: 'user-2',
    referralCode: 'CODE1234',
    status: ReferralStatus.PENDING,
    rewardAmount: null,
    campaignId: null,
    metadata: null,
    fraudReasons: null,
    requiresManualReview: false,
    quarantinedAt: null,
    createdAt: new Date(),
    completedAt: null,
    rewardedAt: null,
    referrer: null as any,
    referee: null,
    campaign: null,
  };

  beforeEach(async () => {
    referralRepo = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
      create: jest.fn().mockImplementation((val) => val),
    };
    fraudAuditRepo = {
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
      create: jest.fn().mockImplementation((val) => val),
    };
    transactionRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralFraudDetectionService,
        { provide: getRepositoryToken(Referral), useValue: referralRepo },
        {
          provide: getRepositoryToken(ReferralFraudAudit),
          useValue: fraudAuditRepo,
        },
        { provide: getRepositoryToken(Transaction), useValue: transactionRepo },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (_key: string, defaultValue?: unknown) => defaultValue,
            ),
          },
        },
      ],
    }).compile();

    service = module.get(ReferralFraudDetectionService);
  });

  it('detects self-referrals', async () => {
    const result = await service.evaluateReferral({
      ...referral,
      refereeId: referral.referrerId,
    });

    expect(result.isSuspicious).toBe(true);
    expect(result.reasons).toContain(ReferralFraudReason.SELF_REFERRAL);
  });

  it('detects similar metadata attempts', async () => {
    const context = { ipAddress: '127.0.0.1', userAgent: 'jest' };
    const fingerprint = service.buildMetadataFingerprint(context);

    referralRepo.find.mockResolvedValue([
      {
        ...referral,
        id: 'ref-old',
        metadata: { fingerprint },
      },
      {
        ...referral,
        id: 'ref-old-2',
        metadata: { fingerprint },
      },
    ]);

    const result = await service.evaluateReferral(referral, context);
    expect(result.reasons).toContain(ReferralFraudReason.SIMILAR_METADATA);
  });

  it('enforces referral creation rate limits', () => {
    for (let i = 0; i < 20; i++) {
      service.enforceCreationRateLimit('user-1');
    }

    expect(() => service.enforceCreationRateLimit('user-1')).toThrow(
      HttpException,
    );
  });

  it('quarantines suspicious referrals and writes audit trail', async () => {
    const evaluation = {
      isSuspicious: true,
      reasons: [ReferralFraudReason.EXCESSIVE_CREATION],
      metadata: { count: 11 },
      shouldQuarantine: true,
    };

    const saved = await service.quarantineReferral(referral, evaluation);

    expect(saved.status).toBe(ReferralStatus.QUARANTINED);
    expect(saved.requiresManualReview).toBe(true);
    expect(fraudAuditRepo.save).toHaveBeenCalled();
  });

  it('detects suspicious withdrawal patterns', async () => {
    transactionRepo.find.mockResolvedValue([
      {
        type: TxType.DEPOSIT,
        createdAt: new Date('2026-01-01T10:00:00Z'),
      },
      {
        type: TxType.WITHDRAW,
        createdAt: new Date('2026-01-01T10:15:00Z'),
      },
    ]);

    const result = await service.evaluateReferral(referral);
    expect(result.reasons).toContain(ReferralFraudReason.SUSPICIOUS_WITHDRAWAL);
  });
});
