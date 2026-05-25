import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AgentModule } from '../agent/agent.module';
import { ToolService } from './application/tool.service';
import { ToolRuntimeService } from './application/tool-runtime.service';
import { ToolRepository } from './infrastructure/tool.repository';
import { ToolExecutionRepository } from './infrastructure/tool-execution.repository';
import { ToolController } from './presentation/tool.controller';

@Module({
  imports: [KnowledgeModule, AgentModule],
  controllers: [ToolController],
  providers: [ToolService, ToolRuntimeService, ToolRepository, ToolExecutionRepository],
  exports: [ToolService, ToolRuntimeService, ToolRepository, ToolExecutionRepository],
})
export class ToolModule {}
