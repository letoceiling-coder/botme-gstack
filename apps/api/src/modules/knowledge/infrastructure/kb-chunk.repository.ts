import { Injectable } from '@nestjs/common';
import type { KbChunk } from '@botme/database';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class KbChunkRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByDocument(
    workspaceId: string,
    documentId: string,
    page: number,
    pageSize: number,
    search?: string,
  ): Promise<{ items: KbChunk[]; total: number }> {
    const where = {
      workspaceId,
      documentId,
      ...(search?.trim()
        ? { content: { contains: search.trim(), mode: 'insensitive' as const } }
        : {}),
    };
    return Promise.all([
      this.prisma.client.kbChunk.findMany({
        where,
        orderBy: { chunkIndex: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.client.kbChunk.count({ where }),
    ]).then(([items, total]) => ({ items, total }));
  }

  countEmbedded(documentId: string): Promise<number> {
    return this.prisma.client.kbChunk.count({
      where: { documentId, hasEmbedding: true },
    });
  }

  countWithoutEmbedding(workspaceId: string, knowledgeBaseId: string): Promise<number> {
    return this.prisma.client.kbChunk.count({
      where: { workspaceId, knowledgeBaseId, hasEmbedding: false },
    });
  }
}
