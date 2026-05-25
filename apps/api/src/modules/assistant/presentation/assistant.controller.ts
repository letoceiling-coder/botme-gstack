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
import {
  BindAgentSchema,
  BindKnowledgeBasesSchema,
  BindToolsSchema,
  CreateAssistantSchema,
  UpdateAssistantSchema,
} from '@botme/shared';
import { Roles } from '../../../core/decorators/roles.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import type { AuthenticatedRequest } from '../../../core/decorators/current-user.decorator';
import { AssistantService } from '../application/assistant.service';

@Controller('assistants')
export class AssistantController {
  constructor(private readonly assistants: AssistantService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.assistants.list(user.workspaceId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.assistants.get(user.workspaceId, id);
  }

  @Post()
  @Roles('MEMBER')
  create(@CurrentUser() user: AuthenticatedRequest['user'], @Body() body: unknown) {
    const input = CreateAssistantSchema.parse(body);
    return this.assistants.create(user.workspaceId, user.sub, input);
  }

  @Patch(':id')
  @Roles('MEMBER')
  update(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = UpdateAssistantSchema.parse(body);
    return this.assistants.update(user.workspaceId, id, input);
  }

  @Delete(':id')
  @Roles('MEMBER')
  @HttpCode(200)
  remove(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.assistants.remove(user.workspaceId, id);
  }

  @Post(':id/agent')
  @Roles('MEMBER')
  bindAgent(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = BindAgentSchema.parse(body);
    return this.assistants.bindAgent(user.workspaceId, id, input.agentId);
  }

  @Post(':id/kbs')
  @Roles('MEMBER')
  bindKbs(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = BindKnowledgeBasesSchema.parse(body);
    return this.assistants.bindKnowledgeBases(user.workspaceId, id, input.knowledgeBaseIds);
  }

  @Post(':id/tools')
  @Roles('MEMBER')
  bindTools(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = BindToolsSchema.parse(body);
    return this.assistants.bindTools(user.workspaceId, id, input.toolIds);
  }

  @Get(':id/runtime')
  runtime(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.assistants.resolveRuntime(user.workspaceId, id);
  }
}
