import { Injectable } from '@nestjs/common';
import type { KnowledgeBase, Prisma } from '@botme/database';
import { WorkspaceScopedRepository } from '../../../core/repository/workspace-scoped.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class KnowledgeBaseRepository extends WorkspaceScopedRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  findById(workspaceId: string, id: string): Promise<KnowledgeBase | null> {
    return this.prisma.client.knowledgeBase.findFirst({
      where: { ...this.activeScope(workspaceId), id },
    });
  }

  list(workspaceId: string): Promise<KnowledgeBase[]> {
    return this.prisma.client.knowledgeBase.findMany({
      where: this.activeScope(workspaceId),
      orderBy: { updatedAt: 'desc' },
    });
  }

  create(data: Prisma.KnowledgeBaseCreateInput): Promise<KnowledgeBase> {
    return this.prisma.client.knowledgeBase.create({ data });
  }

  update(id: string, data: Prisma.KnowledgeBaseUpdateInput): Promise<KnowledgeBase> {
    return this.prisma.client.knowledgeBase.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<KnowledgeBase> {
    return this.prisma.client.knowledgeBase.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });
  }

  async incrementStats(
    id: string,
    delta: { documentCount?: number; chunkCount?: number; tokenCount?: number },
  ): Promise<void> {
    await this.prisma.client.knowledgeBase.update({
      where: { id },
      data: {
        documentCount: delta.documentCount ? { increment: delta.documentCount } : undefined,
        chunkCount: delta.chunkCount ? { increment: delta.chunkCount } : undefined,
        tokenCount: delta.tokenCount ? { increment: delta.tokenCount } : undefined,
      },
    });
  }
}
