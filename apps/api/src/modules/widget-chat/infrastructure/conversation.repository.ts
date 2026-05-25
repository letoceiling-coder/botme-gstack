import { Injectable } from '@nestjs/common';
import type { Conversation, Message, Prisma } from '@botme/database';
import { WorkspaceScopedRepository } from '../../../core/repository/workspace-scoped.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

export type ConversationWithMessages = Conversation & {
  messages: Message[];
};

@Injectable()
export class ConversationRepository extends WorkspaceScopedRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  findById(
    workspaceId: string,
    conversationId: string,
  ): Promise<ConversationWithMessages | null> {
    return this.prisma.client.conversation.findFirst({
      where: { workspaceId, id: conversationId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  findOpenForVisitor(
    workspaceId: string,
    widgetId: string,
    visitorId: string,
  ): Promise<ConversationWithMessages | null> {
    return this.prisma.client.conversation.findFirst({
      where: {
        workspaceId,
        widgetId,
        visitorId,
        status: 'OPEN',
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  create(data: Prisma.ConversationCreateInput): Promise<Conversation> {
    return this.prisma.client.conversation.create({ data });
  }

  addMessage(data: Prisma.MessageCreateInput): Promise<Message> {
    return this.prisma.client.message.create({ data });
  }

  touchConversation(conversationId: string): Promise<void> {
    return this.prisma.client.conversation
      .update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date(), updatedAt: new Date() },
      })
      .then(() => undefined);
  }

  findOpenAdminTest(
    workspaceId: string,
    assistantId: string,
    adminUserId: string,
  ): Promise<ConversationWithMessages | null> {
    return this.prisma.client.conversation.findFirst({
      where: {
        workspaceId,
        assistantId,
        widgetId: null,
        visitorId: `admin:${adminUserId}`,
        status: 'OPEN',
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  closeConversation(conversationId: string): Promise<void> {
    return this.prisma.client.conversation
      .update({
        where: { id: conversationId },
        data: { status: 'CLOSED', updatedAt: new Date() },
      })
      .then(() => undefined);
  }
}
