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
import { Throttle } from '@nestjs/throttler';
import {
  CreateIntegrationSchema,
  UpdateIntegrationSchema,
} from '@botme/shared';
import { Roles } from '../../../core/decorators/roles.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import type { AuthenticatedRequest } from '../../../core/decorators/current-user.decorator';
import { IntegrationService } from '../application/integration.service';

@Controller('integrations')
export class IntegrationController {
  constructor(private readonly integrations: IntegrationService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.integrations.list(user.workspaceId);
  }

  @Post()
  @Roles('ADMIN')
  create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = CreateIntegrationSchema.parse(body);
    return this.integrations.create(user.workspaceId, user.sub, input, req.ip);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = UpdateIntegrationSchema.parse(body);
    return this.integrations.update(user.workspaceId, user.sub, id, input, req.ip);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(200)
  remove(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.integrations.remove(user.workspaceId, user.sub, id, req.ip);
  }

  @Post(':id/validate')
  @Roles('ADMIN')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  validate(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.integrations.validate(user.workspaceId, id);
  }

  @Post(':id/sync-models')
  @Roles('ADMIN')
  @HttpCode(202)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  syncModels(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.integrations.enqueueSync(user.workspaceId, id);
  }

  @Get(':id/models')
  listModels(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.integrations.listModels(user.workspaceId, id);
  }
}
