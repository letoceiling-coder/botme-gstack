import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkspaceService } from './application/workspace.service';
import { WorkspaceRepository } from './infrastructure/workspace.repository';
import { WorkspaceController } from './presentation/workspace.controller';

@Module({
  imports: [AuthModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkspaceRepository],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
