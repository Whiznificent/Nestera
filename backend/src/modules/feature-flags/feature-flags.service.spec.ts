import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NotFoundException } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlag } from './entities/feature-flag.entity';

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;

  const mockFlagRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const enabledFlag: FeatureFlag = {
    id: 'flag-1',
    key: 'new-dashboard',
    name: 'New Dashboard',
    description: 'Rollout dashboard',
    defaultValue: false,
    type: 'boolean',
    enabled: true,
    forceDisabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        {
          provide: getRepositoryToken(FeatureFlag),
          useValue: mockFlagRepository,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<FeatureFlagsService>(FeatureFlagsService);
  });

  describe('findOne', () => {
    it('returns cached flag when present', async () => {
      mockCacheManager.get.mockResolvedValue(enabledFlag);

      const result = await service.findOne('new-dashboard');

      expect(result).toEqual(enabledFlag);
      expect(mockFlagRepository.findOne).not.toHaveBeenCalled();
    });

    it('loads from database and caches on miss', async () => {
      mockCacheManager.get.mockResolvedValue(undefined);
      mockFlagRepository.findOne.mockResolvedValue(enabledFlag);

      const result = await service.findOne('new-dashboard');

      expect(result).toEqual(enabledFlag);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'feature-flag:new-dashboard',
        enabledFlag,
        60_000,
      );
    });

    it('throws when flag is missing', async () => {
      mockCacheManager.get.mockResolvedValue(undefined);
      mockFlagRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('evaluate', () => {
    it('returns false when force disabled', async () => {
      mockCacheManager.get.mockResolvedValue({
        ...enabledFlag,
        forceDisabled: true,
      });

      const result = await service.evaluate('new-dashboard', {
        address: 'user-1',
      });

      expect(result).toEqual({ value: false, reason: 'force_disabled' });
    });

    it('returns enabled value for default boolean flag', async () => {
      mockCacheManager.get.mockResolvedValue(enabledFlag);

      const result = await service.evaluate('new-dashboard', {
        address: 'user-1',
      });

      expect(result).toEqual({ value: true, reason: 'default' });
    });

    it('matches segment targeting', async () => {
      mockCacheManager.get.mockResolvedValue({
        ...enabledFlag,
        enabled: false,
        targetSegments: ['ADMIN'],
      });

      const result = await service.evaluate('new-dashboard', {
        address: 'user-1',
        segments: ['ADMIN'],
      });

      expect(result.reason).toBe('segment_matched');
      expect(result.value).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('returns true for enabled boolean flag', async () => {
      mockCacheManager.get.mockResolvedValue(enabledFlag);

      await expect(
        service.isEnabled('new-dashboard', { address: 'user-1' }),
      ).resolves.toBe(true);
    });

    it('returns false for disabled boolean flag', async () => {
      mockCacheManager.get.mockResolvedValue({
        ...enabledFlag,
        enabled: false,
      });

      await expect(
        service.isEnabled('new-dashboard', { address: 'user-1' }),
      ).resolves.toBe(false);
    });
  });
});
