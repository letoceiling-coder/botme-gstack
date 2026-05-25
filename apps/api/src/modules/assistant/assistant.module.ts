import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { AssistantService } from './application/assistant.service';
import { AssistantRuntimeResolver } from './application/assistant-runtime.resolver';
import { AssistantRepository } from './infrastructure/assistant.repository';
import { AssistantController } from './presentation/assistant.controller';

@Module({
  imports: [AgentModule],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantRuntimeResolver, AssistantRepository],
  exports: [AssistantService, AssistantRuntimeResolver, AssistantRepository],
})
export class AssistantModule {}
