import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  RateLimitMonitorService,
  RateLimitViolation,
} from './rate-limit-monitor.service';

describe('RateLimitMonitorService', () => {
  let service: RateLimitMonitorService;
  let eventEmitter: EventEmitter2;

  const createViolation = (
    overrides?: Partial<RateLimitViolation>,
  ): RateLimitViolation => ({
    userId: 'user-1',
    ip: '127.0.0.1',
    tier: 'free',
    route: '/api/test',
    method: 'GET',
    throttlerName: 'default',
    limit: 60,
    ttl: 60000,
    timestamp: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitMonitorService,
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<RateLimitMonitorService>(RateLimitMonitorService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordViolation', () => {
    it('should record a violation', () => {
      service.recordViolation(createViolation());
      expect(service.getRecentViolations()).toHaveLength(1);
    });

    it('should emit ratelimit.violation event', () => {
      const violation = createViolation();
      service.recordViolation(violation);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ratelimit.violation',
        violation,
      );
    });

    it('should cap at 1000 violations', () => {
      for (let i = 0; i < 1050; i++) {
        service.recordViolation(createViolation({ userId: `user-${i}` }));
      }
      const violations = service.getRecentViolations(1500);
      expect(violations.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('getRecentViolations', () => {
    it('should return violations in reverse chronological order', () => {
      service.recordViolation(createViolation({ userId: 'first' }));
      service.recordViolation(createViolation({ userId: 'second' }));

      const recent = service.getRecentViolations(2);
      expect(recent[0].userId).toBe('second');
      expect(recent[1].userId).toBe('first');
    });

    it('should limit results', () => {
      for (let i = 0; i < 10; i++) {
        service.recordViolation(createViolation());
      }
      expect(service.getRecentViolations(5)).toHaveLength(5);
    });
  });

  describe('getViolationsByUser', () => {
    it('should filter by userId', () => {
      service.recordViolation(createViolation({ userId: 'user-1' }));
      service.recordViolation(createViolation({ userId: 'user-2' }));
      service.recordViolation(createViolation({ userId: 'user-1' }));

      const violations = service.getViolationsByUser('user-1');
      expect(violations).toHaveLength(2);
      expect(violations.every((v) => v.userId === 'user-1')).toBe(true);
    });
  });

  describe('getViolationSummary', () => {
    it('should return summary with correct structure', () => {
      service.recordViolation(createViolation());
      const summary = service.getViolationSummary();

      expect(summary).toHaveProperty('total');
      expect(summary).toHaveProperty('last24h');
      expect(summary).toHaveProperty('topOffenders');
      expect(summary).toHaveProperty('byTier');
      expect(summary).toHaveProperty('byRoute');
    });

    it('should count violations by tier', () => {
      service.recordViolation(createViolation({ tier: 'free' }));
      service.recordViolation(createViolation({ tier: 'free' }));
      service.recordViolation(createViolation({ tier: 'verified' }));

      const summary = service.getViolationSummary();
      expect(summary.byTier['free']).toBe(2);
      expect(summary.byTier['verified']).toBe(1);
    });

    it('should identify top offenders', () => {
      for (let i = 0; i < 5; i++) {
        service.recordViolation(createViolation({ userId: 'offender' }));
      }
      service.recordViolation(createViolation({ userId: 'one-time' }));

      const summary = service.getViolationSummary();
      expect(summary.topOffenders[0].userId).toBe('offender');
      expect(summary.topOffenders[0].count).toBe(5);
    });
  });
});
