import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../../core/decorators/roles.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import type { AuthenticatedRequest } from '../../../core/decorators/current-user.decorator';
import { CreateOperatorRuntimeTokenSchema, UpdateOperatorRuntimeTokenSchema } from '@botme/shared';
import { OperatorRuntimeTokenService } from '../application/operator-runtime-token.service';

@Controller('widgets/:widgetId/operator-tokens')
export class OperatorRuntimeTokenController {
  constructor(private readonly tokens: OperatorRuntimeTokenService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedRequest['user'], @Param('widgetId') widgetId: string) {
    return this.tokens.list(user.workspaceId, widgetId);
  }

  @Post()
  @Roles('ADMIN')
  create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('widgetId') widgetId: string,
    @Body() body: unknown,
  ) {
    const input = CreateOperatorRuntimeTokenSchema.parse(body);
    return this.tokens.create(user.workspaceId, widgetId, user.sub, input);
  }

  @Patch(':tokenId')
  @Roles('ADMIN')
  update(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('widgetId') widgetId: string,
    @Param('tokenId') tokenId: string,
    @Body() body: unknown,
  ) {
    const input = UpdateOperatorRuntimeTokenSchema.parse(body);
    return this.tokens.update(user.workspaceId, widgetId, tokenId, input);
  }

  @Delete(':tokenId')
  @Roles('ADMIN')
  revoke(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('widgetId') widgetId: string,
    @Param('tokenId') tokenId: string,
  ) {
    return this.tokens.revoke(user.workspaceId, widgetId, tokenId);
  }
}
