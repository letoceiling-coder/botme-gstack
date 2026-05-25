import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../../../core/guards/workspace.guard';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import type { JwtPayload } from '@botme/shared';
import { AssistantTestChatService } from '../application/assistant-test-chat.service';

@Controller('assistants')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class AssistantTestChatController {
  constructor(private readonly chat: AssistantTestChatService) {}

  @Get(':id/test-chat/session')
  getSession(@CurrentUser() user: JwtPayload, @Param('id') assistantId: string) {
    return this.chat.getOrCreateSession(user.workspaceId, assistantId, user.sub);
  }

  @Delete(':id/test-chat/session')
  clearSession(@CurrentUser() user: JwtPayload, @Param('id') assistantId: string) {
    return this.chat.clearSession(user.workspaceId, assistantId, user.sub);
  }
}
