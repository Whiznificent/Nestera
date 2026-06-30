import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExternalCallService } from './external-call.service';

describe('ExternalCallService', () => {
  let service: ExternalCallService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalCallService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(5),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExternalCallService>(ExternalCallService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute', () => {
    it('should execute a successful call', async () => {
      const result = await service.execute('email', async () => 'success');
      expect(result).toBe('success');
    });

    it('should retry on failure and succeed', async () => {
      let attempts = 0;
      const result = await service.execute(
        'email',
        async () => {
          attempts++;
          if (attempts < 2) throw new Error('temp failure');
          return 'recovered';
        },
        { retryDelayMs: 10 },
      );
      expect(result).toBe('recovered');
      expect(attempts).toBe(2);
    });

    it('should throw after all retries exhausted', async () => {
      await expect(
        service.execute(
          'email',
          async () => {
            throw new Error('permanent failure');
          },
          { maxRetries: 1, retryDelayMs: 10 },
        ),
      ).rejects.toThrow('permanent failure');
    });

    it('should timeout slow calls', async () => {
      await expect(
        service.execute(
          'email',
          () => new Promise((resolve) => setTimeout(resolve, 5000)),
          { timeoutMs: 50, maxRetries: 0 },
        ),
      ).rejects.toThrow('timed out');
    }, 10000);

    it('should emit dependency.call event', async () => {
      await service.execute('email', async () => 'ok');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'dependency.call',
        expect.objectContaining({
          dependency: 'email',
          success: true,
        }),
      );
    });
  });

  describe('executeWithFallback', () => {
    it('should return primary result on success', async () => {
      const result = await service.executeWithFallback(
        'email',
        async () => 'primary',
        () => 'fallback',
      );
      expect(result).toBe('primary');
    });

    it('should use fallback when primary fails', async () => {
      const result = await service.executeWithFallback(
        'email',
        async () => {
          throw new Error('failed');
        },
        () => 'fallback',
        { maxRetries: 0, retryDelayMs: 10 },
      );
      expect(result).toBe('fallback');
    });

    it('should support async fallback', async () => {
      const result = await service.executeWithFallback(
        'email',
        async () => {
          throw new Error('failed');
        },
        async () => 'async-fallback',
        { maxRetries: 0, retryDelayMs: 10 },
      );
      expect(result).toBe('async-fallback');
    });
  });

  describe('getDependencyHealth', () => {
    it('should return health for all registered dependencies', () => {
      const health = service.getDependencyHealth();
      expect(health).toHaveProperty('email');
      expect(health).toHaveProperty('stellar-rpc');
      expect(health['email']).toHaveProperty('state');
      expect(health['email']).toHaveProperty('failureRate');
      expect(health['email']).toHaveProperty('avgLatencyMs');
    });
  });

  describe('getMetrics', () => {
    it('should return empty metrics initially', () => {
      const metrics = service.getMetrics();
      expect(metrics).toEqual([]);
    });

    it('should record metrics after calls', async () => {
      await service.execute('email', async () => 'ok');
      const metrics = service.getMetrics('email');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].success).toBe(true);
      expect(metrics[0].dependency).toBe('email');
    });

    it('should filter by dependency name', async () => {
      await service.execute('email', async () => 'ok');
      await service.execute('storage', async () => 'ok');

      const emailMetrics = service.getMetrics('email');
      expect(emailMetrics).toHaveLength(1);
      expect(emailMetrics[0].dependency).toBe('email');
    });
  });
});
