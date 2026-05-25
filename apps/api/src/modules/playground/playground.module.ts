import { Module } from '@nestjs/common';
import { FoundationModule } from '../foundation/foundation.module';
import { AgentModule } from '../agent/agent.module';
import { PlaygroundStreamService } from './application/playground-stream.service';
import { StreamRegistry } from './application/stream-registry';
import { PlaygroundSessionRepository } from './infrastructure/playground-session.repository';
import { PlaygroundController } from './presentation/playground.controller';

@Module({
  imports: [FoundationModule, AgentModule],
  controllers: [PlaygroundController],
  providers: [PlaygroundStreamService, PlaygroundSessionRepository, StreamRegistry],
  exports: [PlaygroundStreamService, StreamRegistry],
})
export class PlaygroundModule {}
