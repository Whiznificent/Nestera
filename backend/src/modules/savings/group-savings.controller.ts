import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Param,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { GroupSavingsService } from './group-savings.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateSavingsGroupDto } from './dto/create-savings-group.dto';
import { ContributeSavingsGroupDto } from './dto/contribute-savings-group.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { RespondInvitationDto } from './dto/respond-invitation.dto';
import { SavingsGroup } from './entities/savings-group.entity';
import { SavingsGroupMember } from './entities/savings-group-member.entity';
import { SavingsGroupActivity } from './entities/savings-group-activity.entity';
import { GroupInvitation } from './entities/group-invitation.entity';

@ApiTags('savings/groups')
@Controller('savings/groups')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GroupSavingsController {
  constructor(private readonly groupSavingsService: GroupSavingsService) {}

  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new savings group' })
  @ApiResponse({
    status: 201,
    description: 'Group created successfully',
    type: SavingsGroup,
  })
  async createGroup(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateSavingsGroupDto,
  ): Promise<{ success: boolean; data: SavingsGroup }> {
    const data = await this.groupSavingsService.createGroup(user.id, dto);
    return { success: true, data };
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join an existing savings group' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({
    status: 200,
    description: 'Joined group successfully',
    type: SavingsGroupMember,
  })
  async joinGroup(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ): Promise<{ success: boolean; data: SavingsGroupMember }> {
    const data = await this.groupSavingsService.joinGroup(user.id, id);
    return { success: true, data };
  }

  @Post(':id/invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invite a user to the savings group' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({
    status: 200,
    description: 'User invited successfully',
    type: GroupInvitation,
  })
  async inviteMember(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
  ): Promise<{ success: boolean; data: GroupInvitation }> {
    const data = await this.groupSavingsService.inviteMember(user.id, id, dto);
    return { success: true, data };
  }

  @Post('invitations/:invitationId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a group invitation' })
  @ApiParam({ name: 'invitationId', description: 'Invitation UUID' })
  @ApiResponse({
    status: 200,
    description: 'Invitation accepted',
    type: SavingsGroupMember,
  })
  async acceptInvitation(
    @CurrentUser() user: { id: string },
    @Param('invitationId') invitationId: string,
    @Body() dto: RespondInvitationDto,
  ): Promise<{ success: boolean; data: SavingsGroupMember }> {
    const data = await this.groupSavingsService.acceptInvitation(
      invitationId,
      user.id,
      dto,
    );
    return { success: true, data };
  }

  @Post('invitations/:invitationId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a group invitation' })
  @ApiParam({ name: 'invitationId', description: 'Invitation UUID' })
  @ApiResponse({
    status: 200,
    description: 'Invitation rejected',
    type: GroupInvitation,
  })
  async rejectInvitation(
    @CurrentUser() user: { id: string },
    @Param('invitationId') invitationId: string,
    @Body() dto: RespondInvitationDto,
  ): Promise<{ success: boolean; data: GroupInvitation }> {
    const data = await this.groupSavingsService.rejectInvitation(
      invitationId,
      user.id,
      dto,
    );
    return { success: true, data };
  }

  @Post(':id/invitations/:invitationId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending invitation' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiParam({ name: 'invitationId', description: 'Invitation UUID' })
  @ApiResponse({
    status: 200,
    description: 'Invitation cancelled',
    type: GroupInvitation,
  })
  async cancelInvitation(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
  ): Promise<{ success: boolean; data: GroupInvitation }> {
    const data = await this.groupSavingsService.cancelInvitation(
      invitationId,
      user.id,
    );
    return { success: true, data };
  }

  @Get(':id/invitations')
  @ApiOperation({ summary: 'List all invitations for a group' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({
    status: 200,
    description: 'List of invitations',
    type: [GroupInvitation],
  })
  async getInvitations(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ): Promise<{ success: boolean; data: GroupInvitation[] }> {
    const data = await this.groupSavingsService.getInvitations(id, user.id);
    return { success: true, data };
  }

  @Get('invitations/mine')
  @ApiOperation({ summary: 'Get my pending invitations' })
  @ApiResponse({
    status: 200,
    description: 'My invitations',
    type: [GroupInvitation],
  })
  async getMyInvitations(
    @CurrentUser() user: { id: string },
  ): Promise<{ success: boolean; data: GroupInvitation[] }> {
    const data = await this.groupSavingsService.getMyInvitations(user.id);
    return { success: true, data };
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List all members of a savings group' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({
    status: 200,
    description: 'List of members',
    type: [SavingsGroupMember],
  })
  async listMembers(
    @Param('id') id: string,
  ): Promise<{ success: boolean; data: SavingsGroupMember[] }> {
    const data = await this.groupSavingsService.listMembers(id);
    return { success: true, data };
  }

  @Post(':id/contribute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Contribute to a savings group' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({
    status: 200,
    description: 'Contribution successful',
    type: SavingsGroup,
  })
  async contribute(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: ContributeSavingsGroupDto,
  ): Promise<{ success: boolean; data: SavingsGroup }> {
    const data = await this.groupSavingsService.contribute(user.id, id, dto);
    return { success: true, data };
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'Get activity feed for a savings group' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({
    status: 200,
    description: 'Activity feed',
    type: [SavingsGroupActivity],
  })
  async getActivity(
    @Param('id') id: string,
  ): Promise<{ success: boolean; data: SavingsGroupActivity[] }> {
    const data = await this.groupSavingsService.getActivity(id);
    return { success: true, data };
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a savings group and receive refund' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({ status: 200, description: 'Left group successfully' })
  async leaveGroup(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string; refundAmount: number }> {
    const result = await this.groupSavingsService.leaveGroup(user.id, id);
    return {
      success: true,
      message: 'Successfully left the group',
      refundAmount: result.refundAmount,
    };
  }
}
