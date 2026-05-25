import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { Roles } from '../../../core/decorators/roles.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import type { AuthenticatedRequest } from '../../../core/decorators/current-user.decorator';
import { WidgetAdminService } from '../application/widget-admin.service';
import { WidgetConnectionCenterService } from '../application/widget-connection-center.service';

@Controller('widgets')
export class WidgetAdminController {
  constructor(
    private readonly widgets: WidgetAdminService,
    private readonly connectionCenterService: WidgetConnectionCenterService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.widgets.list(user.workspaceId);
  }

  @Get(':id/connection-center')
  getConnectionCenter(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.connectionCenterService.getConnectionCenter(user.workspaceId, id);
  }

  @Get(':id/health')
  getHealth(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.connectionCenterService.getConnectionCenter(user.workspaceId, id).then((c) => c.health);
  }

  @Get(':id/preview-session')
  previewSession(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.widgets.getPreviewSession(user.workspaceId, user.sub, id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.widgets.get(user.workspaceId, id);
  }

  @Post()
  @Roles('ADMIN')
  create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() body: unknown,
  ) {
    return this.widgets.create(user.workspaceId, user.sub, body);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.widgets.update(user.workspaceId, id, body);
  }

  @Put(':id/domains')
  @Roles('ADMIN')
  updateDomains(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.widgets.updateDomains(user.workspaceId, user.sub, id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(200)
  remove(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.widgets.remove(user.workspaceId, id);
  }
}
