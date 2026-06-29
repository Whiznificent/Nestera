import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
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
import { CreateSavingsGroupDto } from './dto/create-savings-group.dto';
import { ContributeSavingsGroupDto } from './dto/contribute-savings-group.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { RespondInvitationDto } from './dto/respond-invitation.dto';

@Injectable()
export class GroupSavingsService {
  constructor(
    @InjectRepository(SavingsGroup)
    private readonly groupRepository: Repository<SavingsGroup>,
    @InjectRepository(SavingsGroupMember)
    private readonly memberRepository: Repository<SavingsGroupMember>,
    @InjectRepository(SavingsGroupActivity)
    private readonly activityRepository: Repository<SavingsGroupActivity>,
    @InjectRepository(GroupInvitation)
    private readonly invitationRepository: Repository<GroupInvitation>,
    private readonly dataSource: DataSource,
  ) {}

  async createGroup(
    creatorId: string,
    dto: CreateSavingsGroupDto,
  ): Promise<SavingsGroup> {
    return await this.dataSource.transaction(async (manager) => {
      const group = manager.create(SavingsGroup, {
        ...dto,
        creatorId,
        currentAmount: 0,
        status: SavingsGroupStatus.OPEN,
      });
      const savedGroup = await manager.save(group);

      const member = manager.create(SavingsGroupMember, {
        groupId: savedGroup.id,
        userId: creatorId,
        role: SavingsGroupRole.ADMIN,
        contributionAmount: 0,
      });
      await manager.save(member);

      const activity = manager.create(SavingsGroupActivity, {
        groupId: savedGroup.id,
        userId: creatorId,
        type: SavingsGroupActivityType.CREATED,
        metadata: { name: savedGroup.name },
      });
      await manager.save(activity);

      return savedGroup;
    });
  }

  async joinGroup(
    userId: string,
    groupId: string,
  ): Promise<SavingsGroupMember> {
    const group = await this.groupRepository.findOneBy({ id: groupId });
    if (!group) throw new NotFoundException('Savings group not found');
    if (group.status !== SavingsGroupStatus.OPEN) {
      throw new BadRequestException('Group is not open for joining');
    }

    const existingMember = await this.memberRepository.findOneBy({
      groupId,
      userId,
    });
    if (existingMember) {
      throw new ConflictException('User is already a member of this group');
    }

    return await this.dataSource.transaction(async (manager) => {
      const member = manager.create(SavingsGroupMember, {
        groupId,
        userId,
        role: SavingsGroupRole.MEMBER,
        contributionAmount: 0,
      });
      const savedMember = await manager.save(member);

      const activity = manager.create(SavingsGroupActivity, {
        groupId,
        userId,
        type: SavingsGroupActivityType.JOINED,
      });
      await manager.save(activity);

      return savedMember;
    });
  }

  async inviteMember(
    adminId: string,
    groupId: string,
    dto: InviteMemberDto,
  ): Promise<GroupInvitation> {
    const group = await this.groupRepository.findOneBy({ id: groupId });
    if (!group) throw new NotFoundException('Savings group not found');

    const adminMember = await this.memberRepository.findOneBy({
      groupId,
      userId: adminId,
    });
    if (!adminMember || adminMember.role !== SavingsGroupRole.ADMIN) {
      throw new ForbiddenException('Only group admins can invite members');
    }

    const targetUserId = dto.userId;

    const existingMember = await this.memberRepository.findOneBy({
      groupId,
      userId: targetUserId,
    });
    if (existingMember) {
      throw new ConflictException('User is already a member of this group');
    }

    const pendingInvitation = await this.invitationRepository.findOne({
      where: {
        groupId,
        inviteeId: targetUserId,
        status: InvitationStatus.PENDING,
      },
    });
    if (pendingInvitation) {
      throw new ConflictException(
        'A pending invitation already exists for this user',
      );
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitationData = this.invitationRepository.create({
      groupId,
      inviterId: adminId,
      inviteeId: targetUserId,
      message: dto.message ?? undefined,
      status: InvitationStatus.PENDING,
      expiresAt,
    });
    const savedInvitation =
      await this.invitationRepository.save(invitationData);

    await this.activityRepository.save(
      this.activityRepository.create({
        groupId,
        userId: targetUserId,
        type: SavingsGroupActivityType.INVITED,
        metadata: { invitedBy: adminId, invitationId: savedInvitation.id },
      }),
    );

    return savedInvitation;
  }

  async acceptInvitation(
    invitationId: string,
    userId: string,
    dto?: RespondInvitationDto,
  ): Promise<SavingsGroupMember> {
    const invitation = await this.invitationRepository.findOne({
      where: { id: invitationId, inviteeId: userId },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Invitation is not pending');
    }
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      invitation.status = InvitationStatus.EXPIRED;
      await this.invitationRepository.save(invitation);
      throw new BadRequestException('Invitation has expired');
    }

    const group = await this.groupRepository.findOneBy({
      id: invitation.groupId,
    });
    if (!group || group.status !== SavingsGroupStatus.OPEN) {
      throw new BadRequestException('Group is not open for joining');
    }

    return await this.dataSource.transaction(async (manager) => {
      invitation.status = InvitationStatus.ACCEPTED;
      invitation.respondedAt = new Date();
      await manager.save(invitation);

      const member = manager.create(SavingsGroupMember, {
        groupId: invitation.groupId,
        userId,
        role: SavingsGroupRole.MEMBER,
        contributionAmount: 0,
      });
      const savedMember = await manager.save(member);

      const activity = manager.create(SavingsGroupActivity, {
        groupId: invitation.groupId,
        userId,
        type: SavingsGroupActivityType.JOINED,
        metadata: { invitationId, invitedBy: invitation.inviterId },
      });
      await manager.save(activity);

      return savedMember;
    });
  }

  async rejectInvitation(
    invitationId: string,
    userId: string,
    dto?: RespondInvitationDto,
  ): Promise<GroupInvitation> {
    const invitation = await this.invitationRepository.findOne({
      where: { id: invitationId, inviteeId: userId },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Invitation is not pending');
    }

    invitation.status = InvitationStatus.REJECTED;
    invitation.respondedAt = new Date();
    return this.invitationRepository.save(invitation);
  }

  async cancelInvitation(
    invitationId: string,
    adminId: string,
  ): Promise<GroupInvitation> {
    const invitation = await this.invitationRepository.findOne({
      where: { id: invitationId },
      relations: ['group'],
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    const adminMember = await this.memberRepository.findOneBy({
      groupId: invitation.groupId,
      userId: adminId,
    });
    if (!adminMember || adminMember.role !== SavingsGroupRole.ADMIN) {
      throw new ForbiddenException('Only group admins can cancel invitations');
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Can only cancel pending invitations');
    }

    invitation.status = InvitationStatus.CANCELLED;
    return this.invitationRepository.save(invitation);
  }

  async getInvitations(
    groupId: string,
    adminId: string,
  ): Promise<GroupInvitation[]> {
    const adminMember = await this.memberRepository.findOneBy({
      groupId,
      userId: adminId,
    });
    if (!adminMember || adminMember.role !== SavingsGroupRole.ADMIN) {
      throw new ForbiddenException('Only group admins can view invitations');
    }
    return this.invitationRepository.find({
      where: { groupId },
      relations: ['inviter', 'invitee'],
      order: { createdAt: 'DESC' },
    });
  }

  async getMyInvitations(userId: string): Promise<GroupInvitation[]> {
    return this.invitationRepository.find({
      where: { inviteeId: userId },
      relations: ['group', 'inviter'],
      order: { createdAt: 'DESC' },
    });
  }

  async listMembers(groupId: string): Promise<SavingsGroupMember[]> {
    const group = await this.groupRepository.findOneBy({ id: groupId });
    if (!group) throw new NotFoundException('Savings group not found');

    return await this.memberRepository.find({
      where: { groupId },
      relations: ['user'],
      order: { joinedAt: 'ASC' },
    });
  }

  async contribute(
    userId: string,
    groupId: string,
    dto: ContributeSavingsGroupDto,
  ): Promise<SavingsGroup> {
    const group = await this.groupRepository.findOneBy({ id: groupId });
    if (!group) throw new NotFoundException('Savings group not found');
    if (group.status !== SavingsGroupStatus.OPEN) {
      throw new BadRequestException('Group is not accepting contributions');
    }

    const member = await this.memberRepository.findOneBy({ groupId, userId });
    if (!member) {
      throw new ForbiddenException('Only group members can contribute');
    }

    return await this.dataSource.transaction(async (manager) => {
      const amount = Number(dto.amount);

      // Update member contribution
      member.contributionAmount = Number(member.contributionAmount) + amount;
      await manager.save(member);

      // Update group total
      group.currentAmount = Number(group.currentAmount) + amount;

      // Check if goal reached
      if (Number(group.currentAmount) >= Number(group.targetAmount)) {
        group.status = SavingsGroupStatus.COMPLETED;
      }

      const savedGroup = await manager.save(group);

      // Record activity
      const activity = manager.create(SavingsGroupActivity, {
        groupId,
        userId,
        type: SavingsGroupActivityType.CONTRIBUTED,
        amount,
      });
      await manager.save(activity);

      return savedGroup;
    });
  }

  async getActivity(groupId: string): Promise<SavingsGroupActivity[]> {
    const group = await this.groupRepository.findOneBy({ id: groupId });
    if (!group) throw new NotFoundException('Savings group not found');

    return await this.activityRepository.find({
      where: { groupId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async leaveGroup(
    userId: string,
    groupId: string,
  ): Promise<{ success: boolean; refundAmount: number }> {
    const group = await this.groupRepository.findOneBy({ id: groupId });
    if (!group) throw new NotFoundException('Savings group not found');

    const member = await this.memberRepository.findOneBy({ groupId, userId });
    if (!member) throw new NotFoundException('Membership not found');

    return await this.dataSource.transaction(async (manager) => {
      const refundAmount = Number(member.contributionAmount);

      // Update group amount
      group.currentAmount = Number(group.currentAmount) - refundAmount;
      if (
        group.status === SavingsGroupStatus.COMPLETED &&
        Number(group.currentAmount) < Number(group.targetAmount)
      ) {
        group.status = SavingsGroupStatus.OPEN;
      }
      await manager.save(group);

      // Record refund activity
      if (refundAmount > 0) {
        const refundActivity = manager.create(SavingsGroupActivity, {
          groupId,
          userId,
          type: SavingsGroupActivityType.REFUNDED,
          amount: refundAmount,
        });
        await manager.save(refundActivity);
      }

      // Record leave activity
      const leaveActivity = manager.create(SavingsGroupActivity, {
        groupId,
        userId,
        type: SavingsGroupActivityType.LEFT,
      });
      await manager.save(leaveActivity);

      // Remove member
      await manager.remove(member);

      return { success: true, refundAmount };
    });
  }
}
