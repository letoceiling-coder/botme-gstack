import { Injectable } from '@nestjs/common';
import type { KbDocument, Prisma } from '@botme/database';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class KbDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(workspaceId: string, id: string): Promise<KbDocument | null> {
    return this.prisma.client.kbDocument.findFirst({
      where: { workspaceId, id, deletedAt: null },
    });
  }

  listByKb(workspaceId: string, knowledgeBaseId: string): Promise<KbDocument[]> {
    return this.prisma.client.kbDocument.findMany({
      where: { workspaceId, knowledgeBaseId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: Prisma.KbDocumentCreateInput): Promise<KbDocument> {
    return this.prisma.client.kbDocument.create({ data });
  }

  update(id: string, data: Prisma.KbDocumentUpdateInput): Promise<KbDocument> {
    return this.prisma.client.kbDocument.update({ where: { id }, data });
  }

  softDelete(id: string, fileHash: string): Promise<KbDocument> {
    return this.prisma.client.kbDocument.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'DELETED',
        fileHash: `tombstone:${id}:${fileHash}`,
      },
    });
  }

  findActiveByHash(
    workspaceId: string,
    knowledgeBaseId: string,
    fileHash: string,
  ): Promise<KbDocument | null> {
    return this.prisma.client.kbDocument.findFirst({
      where: {
        workspaceId,
        knowledgeBaseId,
        fileHash,
        deletedAt: null,
        status: { notIn: ['FAILED', 'DELETED'] },
      },
    });
  }
}
