import { Module } from '@nestjs/common';
import { FoundationModule } from '../foundation/foundation.module';
import { IntegrationModule } from '../integration/integration.module';
import { AgentService } from './application/agent.service';
import { AgentModelRuntimeRouter } from './application/agent-model-runtime-router.service';
import { AgentRepository } from './infrastructure/agent.repository';
import { AgentModelFallbackRepository } from './infrastructure/agent-model-fallback.repository';
import { AgentController } from './presentation/agent.controller';

@Module({
  imports: [FoundationModule, IntegrationModule],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentRepository,
    AgentModelFallbackRepository,
    AgentModelRuntimeRouter,
  ],
  exports: [AgentService, AgentRepository, AgentModelRuntimeRouter],
})
export class AgentModule {}
