import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../../core/decorators/roles.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import type { AuthenticatedRequest } from '../../../core/decorators/current-user.decorator';
import { ToolService } from '../application/tool.service';

@Controller('tools')
export class ToolController {
  constructor(private readonly tools: ToolService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.tools.list(user.workspaceId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.tools.getDetail(user.workspaceId, id);
  }

  @Patch(':id')
  @Roles('MEMBER')
  update(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.tools.update(user.workspaceId, id, body);
  }

  @Post(':id/test')
  @Roles('MEMBER')
  test(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.tools.testExecute(user.workspaceId, id, body);
  }
}
