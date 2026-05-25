import { Injectable, NotFoundException } from '@nestjs/common';
import type { WidgetMessageDto } from '@botme/shared';
import { ConversationRepository } from '../../widget-chat/infrastructure/conversation.repository';
import { LiveVisitorTrackerService } from './live-visitor-tracker.service';
import { WidgetSocketBridge } from './widget-socket-bridge.service';
import { RealtimeRuntimeService } from './realtime-runtime.service';
import { OperatorSessionLockService } from './operator-session-lock.service';
import { OperatorSocketBridge } from './operator-socket-bridge.service';
import { ChatRealtimeBroadcastService } from './chat-realtime-broadcast.service';

const OPERATOR_MARKER = 'operator:';

@Injectable()
export class OperatorChatService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly visitors: LiveVisitorTrackerService,
    private readonly widgetBridge: WidgetSocketBridge,
    private readonly runtime: RealtimeRuntimeService,
    private readonly locks: OperatorSessionLockService,
    private readonly operatorBridge: OperatorSocketBridge,
    private readonly chatBroadcast: ChatRealtimeBroadcastService,
  ) {}

  async fetchConversation(workspaceId: string, conversationId: string) {
    const conversation = await this.conversations.findById(workspaceId, conversationId);
    if (!conversation) throw new NotFoundException('Диалог не найден');
    return {
      conversationId: conversation.id,
      visitorId: conversation.visitorId,
      status: conversation.status,
      messages: conversation.messages.map((m) => this.toMessageDto(m)),
    };
  }

  async sendOperatorMessage(
    workspaceId: string,
    operatorId: string,
    conversationId: string,
    content: string,
  ): Promise<WidgetMessageDto> {
    const conversation = await this.conversations.findById(workspaceId, conversationId);
    if (!conversation || conversation.status !== 'OPEN') {
      throw new NotFoundException('Диалог не найден');
    }

    await this.locks.acquire(workspaceId, conversationId, operatorId);
    const visitor = await this.visitors.findByConversation(workspaceId, conversationId);
    if (visitor) {
      await this.visitors.setControlMode(workspaceId, visitor.id, 'OPERATOR');
    }

    const saved = await this.conversations.addMessage({
      conversation: { connect: { id: conversationId } },
      workspace: { connect: { id: workspaceId } },
      role: 'ASSISTANT',
      content,
      providerMessageId: `${OPERATOR_MARKER}${operatorId}`,
    });
    await this.conversations.touchConversation(conversationId);

    const dto = this.toMessageDto(saved);

    this.chatBroadcast.broadcastMessage(workspaceId, conversationId, dto);

    if (visitor?.socketId) {
      this.widgetBridge.emitToSocket(
        visitor.socketId,
        this.runtime,
        workspaceId,
        visitor.visitorId,
        'widget:operator-message',
        {
          type: 'widget:operator-message',
          conversationId,
          message: dto,
        },
      );
    }

    return dto;
  }

  emitVisitorTyping(workspaceId: string, conversationId: string, active: boolean): void {
    this.operatorBridge.emitToWorkspace(workspaceId, 'operator:visitor-typing', {
      conversationId,
      active,
    });
  }

  broadcastNewMessage(workspaceId: string, conversationId: string, message: WidgetMessageDto): void {
    this.chatBroadcast.broadcastMessage(workspaceId, conversationId, message);
    void this.chatBroadcast.refreshVisitorList(workspaceId);
  }

  emitOperatorTyping(workspaceId: string, conversationId: string, active: boolean): void {
    void this.visitors.findByConversation(workspaceId, conversationId).then((visitor) => {
      if (!visitor?.socketId) return;
      this.widgetBridge.emitToSocket(
        visitor.socketId,
        this.runtime,
        workspaceId,
        visitor.visitorId,
        'widget:operator-typing',
        {
          type: 'widget:operator-typing',
          conversationId,
          active,
        },
      );
    });
  }

  toMessageDto(message: {
    id: string;
    role: string;
    content: string;
    createdAt: Date;
    providerMessageId: string | null;
  }): WidgetMessageDto {
    const isOperator = message.providerMessageId?.startsWith(OPERATOR_MARKER) ?? false;
    return {
      id: message.id,
      role: message.role as WidgetMessageDto['role'],
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      author: message.role === 'USER' ? 'visitor' : isOperator ? 'operator' : 'ai',
    };
  }
}
