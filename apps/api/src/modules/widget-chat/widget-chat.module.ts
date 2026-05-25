import { Module } from '@nestjs/common';
import { AssistantModule } from '../assistant/assistant.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { FoundationModule } from '../foundation/foundation.module';
import { ToolModule } from '../tool/tool.module';
import { WidgetChatService } from './application/widget-chat.service';
import { WidgetStreamRegistry } from './application/widget-stream-registry';
import { ConversationRepository } from './infrastructure/conversation.repository';

@Module({
  imports: [FoundationModule, AssistantModule, KnowledgeModule, ToolModule],
  providers: [WidgetChatService, WidgetStreamRegistry, ConversationRepository],
  exports: [WidgetChatService, WidgetStreamRegistry, ConversationRepository],
})
export class WidgetChatModule {}
