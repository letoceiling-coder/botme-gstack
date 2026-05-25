import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common/pipes';
import {
  CreateAgentSchema,
  CreatePromptVersionSchema,
  UpdateAgentSchema,
} from '@botme/shared';
import { Roles } from '../../../core/decorators/roles.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import type { AuthenticatedRequest } from '../../../core/decorators/current-user.decorator';
import { AgentService } from '../application/agent.service';

@Controller('agents')
export class AgentController {
  constructor(private readonly agents: AgentService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.agents.list(user.workspaceId);
  }

  @Get(':id/runtime-diagnostics')
  @Roles('MEMBER')
  runtimeDiagnostics(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.agents.getRuntimeDiagnostics(user.workspaceId, id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.agents.get(user.workspaceId, id);
  }

  @Post()
  @Roles('ADMIN')
  create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = CreateAgentSchema.parse(body);
    return this.agents.create(user.workspaceId, user.sub, input, req.ip);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = UpdateAgentSchema.parse(body);
    return this.agents.update(user.workspaceId, user.sub, id, input, req.ip);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(200)
  remove(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.agents.remove(user.workspaceId, user.sub, id, req.ip);
  }

  @Post(':id/prompts')
  @Roles('ADMIN')
  createPrompt(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = CreatePromptVersionSchema.parse(body);
    return this.agents.createPromptVersion(user.workspaceId, user.sub, id, input, req.ip);
  }

  @Post(':id/prompts/:version/activate')
  @Roles('ADMIN')
  @HttpCode(200)
  activatePrompt(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.agents.activatePromptVersion(user.workspaceId, user.sub, id, version, req.ip);
  }
}
