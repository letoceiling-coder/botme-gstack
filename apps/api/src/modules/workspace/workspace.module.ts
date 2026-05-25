import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WorkspaceService } from './application/workspace.service';
import { WorkspaceMembersService } from './application/workspace-members.service';
import { WorkspaceRepository } from './infrastructure/workspace.repository';
import { WorkspaceController } from './presentation/workspace.controller';
import { WorkspaceMembersController } from './presentation/workspace-members.controller';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [WorkspaceController, WorkspaceMembersController],
  providers: [WorkspaceService, WorkspaceMembersService, WorkspaceRepository],
  exports: [WorkspaceService, WorkspaceMembersService],
})
export class WorkspaceModule {}
