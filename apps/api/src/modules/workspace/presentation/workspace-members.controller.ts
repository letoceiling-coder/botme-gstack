import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../../core/decorators/roles.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import type { AuthenticatedRequest } from '../../../core/decorators/current-user.decorator';
import { WorkspaceMembersService } from '../application/workspace-members.service';

@Controller('workspaces/current/members')
export class WorkspaceMembersController {
  constructor(private readonly members: WorkspaceMembersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.members.listMembers(user.workspaceId);
  }

  @Get('invites')
  @Roles('ADMIN')
  listInvites(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.members.listInvites(user.workspaceId);
  }

  @Post('invite')
  @Roles('ADMIN')
  invite(@CurrentUser() user: AuthenticatedRequest['user'], @Body() body: unknown) {
    return this.members.inviteMember(user.workspaceId, user.sub, body);
  }

  @Delete('invites/:inviteId')
  @Roles('ADMIN')
  revokeInvite(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('inviteId') inviteId: string,
  ) {
    return this.members.revokeInvite(user.workspaceId, inviteId);
  }

  @Patch(':memberId')
  @Roles('ADMIN')
  updateRole(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('memberId') memberId: string,
    @Body() body: unknown,
  ) {
    return this.members.updateMemberRole(user.workspaceId, user.sub, memberId, body);
  }

  @Delete(':memberId')
  @Roles('ADMIN')
  remove(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('memberId') memberId: string,
  ) {
    return this.members.removeMember(user.workspaceId, user.sub, memberId);
  }
}
