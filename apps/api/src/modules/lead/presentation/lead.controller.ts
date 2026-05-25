import { Body, Controller, Get, Header, Param, Patch, Query } from '@nestjs/common';
import { Roles } from '../../../core/decorators/roles.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import type { AuthenticatedRequest } from '../../../core/decorators/current-user.decorator';
import { LeadService } from '../application/lead.service';

@Controller('leads')
export class LeadController {
  constructor(private readonly leads: LeadService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.leads.list(user.workspaceId, query);
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="leads.csv"')
  exportCsv(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.leads.exportCsv(user.workspaceId);
  }

  @Patch(':id')
  @Roles('MEMBER')
  update(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.leads.update(user.workspaceId, id, body);
  }
}
