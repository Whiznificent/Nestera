jest.mock('uuid', () => ({
  v4: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { AdminConfirmationService } from './admin-confirmation.service';
import { AdminConfirmation } from './entities/admin-confirmation.entity';

describe('AdminConfirmationService', () => {
  let service: AdminConfirmationService;
  let repository: Repository<AdminConfirmation>;

  const mockAdminId = '550e8400-e29b-41d4-a716-446655440000';
  const mockToken = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminConfirmationService,
        {
          provide: getRepositoryToken(AdminConfirmation),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdminConfirmationService>(AdminConfirmationService);
    repository = module.get<Repository<AdminConfirmation>>(
      getRepositoryToken(AdminConfirmation),
    );
  });

  describe('requestConfirmation', () => {
    it('should create and return a confirmation token', async () => {
      const actionType = 'PATCH:/admin/users/123/kyc/approve';
      const actionDetails = { userId: '123' };

      const mockConfirmation = {
        token: expect.any(String),
        adminId: mockAdminId,
        actionType,
        actionDetails,
        expiresAt: expect.any(Date),
        isUsed: false,
      };

      (repository.create as jest.Mock).mockReturnValue(mockConfirmation);
      (repository.save as jest.Mock).mockResolvedValue(mockConfirmation);

      const result = await service.requestConfirmation(
        mockAdminId,
        actionType,
        actionDetails,
      );

      expect(result.confirmationToken).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('verifyConfirmation', () => {
    it('should verify and consume a valid token', async () => {
      const actionType = 'PATCH:/admin/users/123/kyc/approve';
      const mockConfirmation: Partial<AdminConfirmation> = {
        token: mockToken,
        adminId: mockAdminId,
        actionType,
        isUsed: false,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      };

      (repository.findOne as jest.Mock).mockResolvedValue(mockConfirmation);
      (repository.save as jest.Mock).mockResolvedValue({
        ...mockConfirmation,
        isUsed: true,
        usedAt: new Date(),
      });

      const result = await service.verifyConfirmation(
        mockToken,
        mockAdminId,
        actionType,
      );

      expect(result.isUsed).toBe(true);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw if token not found', async () => {
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.verifyConfirmation(mockToken, mockAdminId, 'some-action'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if token already used', async () => {
      const mockConfirmation: Partial<AdminConfirmation> = {
        token: mockToken,
        adminId: mockAdminId,
        isUsed: true,
      };

      (repository.findOne as jest.Mock).mockResolvedValue(mockConfirmation);

      await expect(
        service.verifyConfirmation(mockToken, mockAdminId, 'some-action'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if token expired', async () => {
      const mockConfirmation: Partial<AdminConfirmation> = {
        token: mockToken,
        adminId: mockAdminId,
        actionType: 'PATCH:/admin/users/123/kyc/approve',
        isUsed: false,
        expiresAt: new Date(Date.now() - 1000), // Expired
      };

      (repository.findOne as jest.Mock).mockResolvedValue(mockConfirmation);

      await expect(
        service.verifyConfirmation(
          mockToken,
          mockAdminId,
          'PATCH:/admin/users/123/kyc/approve',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired tokens', async () => {
      (repository.delete as jest.Mock).mockResolvedValue({ affected: 5 });

      const result = await service.cleanupExpiredTokens();

      expect(result).toBe(5);
      expect(repository.delete).toHaveBeenCalled();
    });
  });

  describe('getPendingConfirmations', () => {
    it('should return pending confirmations for an admin', async () => {
      const mockConfirmations: Partial<AdminConfirmation>[] = [
        { token: mockToken, adminId: mockAdminId, isUsed: false },
      ];

      (repository.find as jest.Mock).mockResolvedValue(mockConfirmations);

      const result = await service.getPendingConfirmations(mockAdminId);

      expect(result).toHaveLength(1);
      expect(repository.find).toHaveBeenCalledWith({
        where: {
          adminId: mockAdminId,
          isUsed: false,
        },
        order: { createdAt: 'DESC' },
      });
    });
  });
});
