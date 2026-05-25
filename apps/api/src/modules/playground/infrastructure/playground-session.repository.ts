import { Injectable } from '@nestjs/common';
import type { PlaygroundMessage, PlaygroundSession, Prisma } from '@botme/database';
import { WorkspaceScopedRepository } from '../../../core/repository/workspace-scoped.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

export type SessionWithMessages = PlaygroundSession & { messages: PlaygroundMessage[] };

@Injectable()
export class PlaygroundSessionRepository extends WorkspaceScopedRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  findById(workspaceId: string, id: string): Promise<SessionWithMessages | null> {
    return this.prisma.client.playgroundSession.findFirst({
      where: { workspaceId, id, deletedAt: null },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  findActiveForUser(
    workspaceId: string,
    agentId: string,
    userId: string,
  ): Promise<SessionWithMessages | null> {
    return this.prisma.client.playgroundSession.findFirst({
      where: { workspaceId, agentId, userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  create(data: Prisma.PlaygroundSessionCreateInput): Promise<PlaygroundSession> {
    return this.prisma.client.playgroundSession.create({ data });
  }

  update(id: string, data: Prisma.PlaygroundSessionUpdateInput): Promise<PlaygroundSession> {
    return this.prisma.client.playgroundSession.update({ where: { id }, data });
  }

  addMessage(data: Prisma.PlaygroundMessageCreateInput): Promise<PlaygroundMessage> {
    return this.prisma.client.playgroundMessage.create({ data });
  }

  async clearMessages(sessionId: string): Promise<void> {
    await this.prisma.client.playgroundMessage.deleteMany({ where: { sessionId } });
  }

  async softClearSession(workspaceId: string, sessionId: string): Promise<void> {
    await this.prisma.client.playgroundMessage.deleteMany({
      where: { session: { id: sessionId, workspaceId } },
    });
    await this.prisma.client.playgroundSession.update({
      where: { id: sessionId },
      data: {
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        lastLatencyMs: null,
        lastProvider: null,
        lastModel: null,
        promptVersionId: null,
      },
    });
  }
}
