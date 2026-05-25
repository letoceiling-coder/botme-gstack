import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssistantModule } from '../assistant/assistant.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { WidgetChatModule } from '../widget-chat/widget-chat.module';
import { FoundationModule } from '../foundation/foundation.module';
import { ToolModule } from '../tool/tool.module';
import { AssistantTestChatService } from './application/assistant-test-chat.service';
import { AssistantTestStreamRegistry } from './application/assistant-test-stream-registry';
import { AssistantTestChatController } from './presentation/assistant-test-chat.controller';

@Module({
  imports: [AuthModule, FoundationModule, AssistantModule, KnowledgeModule, WidgetChatModule, ToolModule],
  controllers: [AssistantTestChatController],
  providers: [AssistantTestChatService, AssistantTestStreamRegistry],
  exports: [AssistantTestChatService],
})
export class AssistantTestChatModule {}
