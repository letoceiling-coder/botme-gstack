import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@botme/database';
import { Queue } from 'bullmq';
import { RedisService } from '../../../core/redis/redis.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { KbIntegrityService } from './kb-integrity.service';

@Injectable()
export class KbHealingService {
  private readonly logger = new Logger(KbHealingService.name);
  private readonly parseQueue: Queue;
  private readonly embedQueue: Queue;
  private readonly cleanupQueue: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrity: KbIntegrityService,
    redis: RedisService,
  ) {
    const connection = redis.client;
    this.parseQueue = new Queue('kb.parse', { connection });
    this.embedQueue = new Queue('kb.embed', { connection });
    this.cleanupQueue = new Queue('kb.cleanup', { connection });
  }

  async healKnowledgeBase(workspaceId: string, kbId: string) {
    const report = await this.integrity.auditKnowledgeBase(workspaceId, kbId);
    const actions: string[] = [];

    const orphanChunks = await this.prisma.client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT c.id FROM kb_chunks c
      LEFT JOIN kb_documents d ON d.id = c."documentId"
      WHERE c."workspaceId" = ${workspaceId}
        AND c."knowledgeBaseId" = ${kbId}
        AND (d.id IS NULL OR d."deletedAt" IS NOT NULL)
    `);
    if (orphanChunks.length > 0) {
      await this.prisma.client.kbChunk.deleteMany({
        where: { id: { in: orphanChunks.map((o) => o.id) } },
      });
      actions.push(`deleted ${orphanChunks.length} orphan chunks`);
    }

    const partialDocs = await this.prisma.client.kbDocument.findMany({
      where: {
        workspaceId,
        knowledgeBaseId: kbId,
        deletedAt: null,
        status: 'INDEXED',
      },
      select: { id: true },
    });
    for (const doc of partialDocs) {
      const pending = await this.prisma.client.kbChunk.count({
        where: { documentId: doc.id, hasEmbedding: false },
      });
      if (pending > 0) {
        await this.prisma.client.kbDocument.update({
          where: { id: doc.id },
          data: { status: 'EMBEDDING' },
        });
        await this.embedQueue.add(
          'embed',
          { documentId: doc.id, workspaceId, knowledgeBaseId: kbId },
          { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
        );
        actions.push(`re-queued embed for doc ${doc.id} (${pending} chunks)`);
      }
    }

    const stuck = await this.prisma.client.kbDocument.findMany({
      where: {
        workspaceId,
        knowledgeBaseId: kbId,
        deletedAt: null,
        status: { in: ['FAILED', 'RETRYING'] },
      },
      select: { id: true, sourceType: true },
    });
    for (const doc of stuck) {
      await this.parseQueue.add(
        'parse',
        { documentId: doc.id, workspaceId, knowledgeBaseId: kbId },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );
      actions.push(`re-queued parse for failed doc ${doc.id}`);
    }

    await this.reconcileCounters(workspaceId, kbId);
    actions.push('reconciled KB counters');

    const after = await this.integrity.auditKnowledgeBase(workspaceId, kbId);
    this.logger.log(`heal kb=${kbId} actions=${actions.join('; ')}`);
    return { before: report, after, actions };
  }

  async reconcileCounters(workspaceId: string, kbId: string): Promise<void> {
    const actualDocs = await this.prisma.client.kbDocument.count({
      where: { workspaceId, knowledgeBaseId: kbId, deletedAt: null, status: 'INDEXED' },
    });
    const actualChunks = await this.prisma.client.kbChunk.count({
      where: { workspaceId, knowledgeBaseId: kbId },
    });
    const tokenSum = await this.prisma.client.kbChunk.aggregate({
      where: { workspaceId, knowledgeBaseId: kbId },
      _sum: { tokenCount: true },
    });
    await this.prisma.client.knowledgeBase.update({
      where: { id: kbId },
      data: {
        documentCount: actualDocs,
        chunkCount: actualChunks,
        tokenCount: tokenSum._sum.tokenCount ?? 0,
      },
    });
  }
}
