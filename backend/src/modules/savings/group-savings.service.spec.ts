import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GroupSavingsService } from './group-savings.service';
import {
  SavingsGroup,
  SavingsGroupStatus,
} from './entities/savings-group.entity';
import {
  SavingsGroupMember,
  SavingsGroupRole,
} from './entities/savings-group-member.entity';
import {
  SavingsGroupActivity,
  SavingsGroupActivityType,
} from './entities/savings-group-activity.entity';
import {
  GroupInvitation,
  InvitationStatus,
} from './entities/group-invitation.entity';
import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

describe('GroupSavingsService', () => {
  let service: GroupSavingsService;
  let groupRepository: any;
  let memberRepository: any;
  let activityRepository: any;
  let invitationRepository: any;
  let dataSource: any;

  beforeEach(async () => {
    groupRepository = {
      findOneBy: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    memberRepository = {
      findOneBy: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      remove: jest.fn(),
    };
    activityRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };
    invitationRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((data: any) => data),
      save: jest.fn((data: any) =>
        Promise.resolve({ ...data, id: 'invitation-generated-id' }),
      ),
    };
    dataSource = {
      transaction: jest.fn((cb) =>
        cb({
          create: jest.fn((entity: any, data: any) => data),
          save: jest.fn((data: any) => Promise.resolve(data)),
          remove: jest.fn((data: any) => Promise.resolve(data)),
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupSavingsService,
        {
          provide: getRepositoryToken(SavingsGroup),
          useValue: groupRepository,
        },
        {
          provide: getRepositoryToken(SavingsGroupMember),
          useValue: memberRepository,
        },
        {
          provide: getRepositoryToken(SavingsGroupActivity),
          useValue: activityRepository,
        },
        {
          provide: getRepositoryToken(GroupInvitation),
          useValue: invitationRepository,
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<GroupSavingsService>(GroupSavingsService);
  });

  describe('createGroup', () => {
    it('should create a group and add creator as admin', async () => {
      const dto = { name: 'Test Group', targetAmount: 1000 };
      const userId = 'user-1';

      const result = await service.createGroup(userId, dto);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result.name).toBe('Test Group');
      expect(result.creatorId).toBe(userId);
    });
  });

  describe('joinGroup', () => {
    it('should allow a user to join an open group', async () => {
      const userId = 'user-2';
      const groupId = 'group-1';
      groupRepository.findOneBy.mockResolvedValue({
        id: groupId,
        status: SavingsGroupStatus.OPEN,
      });
      memberRepository.findOneBy.mockResolvedValue(null);

      const result = await service.joinGroup(userId, groupId);

      expect(result.userId).toBe(userId);
      expect(result.groupId).toBe(groupId);
    });

    it('should throw ConflictException if already a member', async () => {
      groupRepository.findOneBy.mockResolvedValue({
        id: 'group-1',
        status: SavingsGroupStatus.OPEN,
      });
      memberRepository.findOneBy.mockResolvedValue({ id: 'member-1' });

      await expect(service.joinGroup('user-1', 'group-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('inviteMember', () => {
    it('should allow admin to invite a user', async () => {
      const adminId = 'admin-1';
      const groupId = 'group-1';
      const targetUserId = 'user-3';
      const dto = { userId: targetUserId, message: 'Join us!' };

      groupRepository.findOneBy.mockResolvedValue({ id: groupId });
      memberRepository.findOneBy
        .mockResolvedValueOnce({
          id: 'admin-member',
          role: SavingsGroupRole.ADMIN,
        })
        .mockResolvedValueOnce(null);
      invitationRepository.findOne.mockResolvedValue(null);
      invitationRepository.create.mockReturnValueOnce({
        groupId,
        inviterId: adminId,
        inviteeId: targetUserId,
        message: 'Join us!',
        status: InvitationStatus.PENDING,
      });

      const result = await service.inviteMember(adminId, groupId, dto);

      expect(result.inviteeId).toBe(targetUserId);
      expect(result.status).toBe(InvitationStatus.PENDING);
    });

    it('should throw ForbiddenException if non-admin invites', async () => {
      groupRepository.findOneBy.mockResolvedValue({ id: 'group-1' });
      memberRepository.findOneBy.mockResolvedValue({
        id: 'member-1',
        role: SavingsGroupRole.MEMBER,
      });

      await expect(
        service.inviteMember('user-1', 'group-1', { userId: 'user-2' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if pending invitation exists', async () => {
      const adminId = 'admin-1';
      const groupId = 'group-1';
      const targetUserId = 'user-3';

      groupRepository.findOneBy.mockResolvedValue({ id: groupId });
      memberRepository.findOneBy
        .mockResolvedValueOnce({
          id: 'admin-member',
          role: SavingsGroupRole.ADMIN,
        })
        .mockResolvedValueOnce(null);
      invitationRepository.findOne.mockResolvedValue({
        id: 'invite-1',
        status: InvitationStatus.PENDING,
      });

      await expect(
        service.inviteMember(adminId, groupId, { userId: targetUserId }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('acceptInvitation', () => {
    it('should accept a pending invitation and add as member', async () => {
      const userId = 'user-3';
      const invitationId = 'invite-1';
      const groupId = 'group-1';

      invitationRepository.findOne.mockResolvedValue({
        id: invitationId,
        groupId,
        inviteeId: userId,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 86400000),
        inviterId: 'admin-1',
      });
      groupRepository.findOneBy.mockResolvedValue({
        id: groupId,
        status: SavingsGroupStatus.OPEN,
      });

      const result = await service.acceptInvitation(invitationId, userId);

      expect(result.groupId).toBe(groupId);
      expect(result.userId).toBe(userId);
    });

    it('should throw NotFoundException for invalid invitation', async () => {
      invitationRepository.findOne.mockResolvedValue(null);

      await expect(
        service.acceptInvitation('invalid-id', 'user-3'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejectInvitation', () => {
    it('should reject a pending invitation', async () => {
      const userId = 'user-3';
      const invitationId = 'invite-1';

      invitationRepository.findOne.mockResolvedValue({
        id: invitationId,
        inviteeId: userId,
        status: InvitationStatus.PENDING,
      });
      invitationRepository.save.mockImplementation((data) =>
        Promise.resolve(data),
      );

      const result = await service.rejectInvitation(invitationId, userId);

      expect(result.status).toBe(InvitationStatus.REJECTED);
    });
  });

  describe('contribute', () => {
    it('should update group and member amounts', async () => {
      const userId = 'user-1';
      const groupId = 'group-1';
      const dto = { amount: 100 };

      groupRepository.findOneBy.mockResolvedValue({
        id: groupId,
        status: SavingsGroupStatus.OPEN,
        currentAmount: 0,
        targetAmount: 1000,
      });
      memberRepository.findOneBy.mockResolvedValue({
        groupId,
        userId,
        contributionAmount: 0,
      });

      const result = await service.contribute(userId, groupId, dto);

      expect(Number(result.currentAmount)).toBe(100);
    });

    it('should complete group if target reached', async () => {
      groupRepository.findOneBy.mockResolvedValue({
        id: 'group-1',
        status: SavingsGroupStatus.OPEN,
        currentAmount: 950,
        targetAmount: 1000,
      });
      memberRepository.findOneBy.mockResolvedValue({ contributionAmount: 0 });

      const result = await service.contribute('user-1', 'group-1', {
        amount: 50,
      });

      expect(result.status).toBe(SavingsGroupStatus.COMPLETED);
    });
  });

  describe('leaveGroup', () => {
    it('should refund user and remove member', async () => {
      const userId = 'user-1';
      const groupId = 'group-1';
      groupRepository.findOneBy.mockResolvedValue({
        id: groupId,
        currentAmount: 500,
      });
      memberRepository.findOneBy.mockResolvedValue({
        id: 'member-1',
        contributionAmount: 100,
      });

      const result = await service.leaveGroup(userId, groupId);

      expect(result.success).toBe(true);
      expect(result.refundAmount).toBe(100);
    });
  });
});
