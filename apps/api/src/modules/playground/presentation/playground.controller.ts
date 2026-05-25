import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Roles } from '../../../core/decorators/roles.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import type { AuthenticatedRequest } from '../../../core/decorators/current-user.decorator';
import { PlaygroundStreamService } from '../application/playground-stream.service';
import { PlaygroundSessionRepository } from '../infrastructure/playground-session.repository';

@Controller('playground')
export class PlaygroundController {
  constructor(
    private readonly playground: PlaygroundStreamService,
    private readonly sessions: PlaygroundSessionRepository,
  ) {}

  @Get('sessions/:agentId')
  @Roles('MEMBER')
  getSession(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('agentId') agentId: string,
  ) {
    return this.sessions
      .findActiveForUser(user.workspaceId, agentId, user.sub)
      .then((s) => (s ? this.playground.toSessionDto(s) : null));
  }

  @Delete('sessions/:sessionId')
  @Roles('MEMBER')
  @HttpCode(200)
  clearSession(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('sessionId') sessionId: string,
  ) {
    return this.playground.clearSession(user.workspaceId, sessionId);
  }

  @Post('sessions/:sessionId/cancel')
  @Roles('MEMBER')
  @HttpCode(200)
  cancel(@Param('sessionId') sessionId: string) {
    void sessionId;
    return { ok: true };
  }
}
