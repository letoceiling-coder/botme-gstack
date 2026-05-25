import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../../core/decorators/roles.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import type { AuthenticatedRequest } from '../../../core/decorators/current-user.decorator';
import { RealtimeDiagnosticsService } from '../services/realtime-diagnostics.service';

@Controller('realtime/diagnostics')
export class RealtimeDiagnosticsController {
  constructor(private readonly diagnostics: RealtimeDiagnosticsService) {}

  @Get()
  @Roles('ADMIN')
  get(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.diagnostics.getDiagnostics(user.workspaceId);
  }

  @Get('rtc')
  @Roles('ADMIN')
  getRtc(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.diagnostics.getRtcDiagnostics(user.workspaceId);
  }

  @Get('calls')
  @Roles('ADMIN')
  getActiveCalls(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.diagnostics.getRtcDiagnostics(user.workspaceId);
  }
}
