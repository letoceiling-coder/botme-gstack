import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import type { JwtPayload } from '@botme/shared';
import { WorkspaceService } from '../application/workspace.service';

class CreateWorkspaceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaces: WorkspaceService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.workspaces.listForUser(user.sub);
  }

  @Get('current/summary')
  summary(@CurrentUser() user: JwtPayload) {
    return this.workspaces.getSummary(user.workspaceId, user.sub);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() body: CreateWorkspaceDto) {
    return this.workspaces.create(user.sub, body.name);
  }
}
