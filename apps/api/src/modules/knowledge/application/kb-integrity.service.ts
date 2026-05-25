import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@botme/database';
import { PrismaService } from '../../../core/prisma/prisma.service';

export interface KbIntegrityIssue {
  code: string;
  severity: 'critical' | 'warning' | 'info';
  count: number;
  message: string;
  sampleIds?: string[];
}

export interface KbIntegrityReport {
  knowledgeBaseId: string;
  checkedAt: string;
  healthy: boolean;
  issues: KbIntegrityIssue[];
  stats: {
    documents: number;
    chunks: number;
    embeddedChunks: number;
    orphanChunks: number;
    stuckDocuments: number;
    counterDrift: boolean;
  };
}

@Injectable()
export class KbIntegrityService {
  private readonly logger = new Logger(KbIntegrityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async auditKnowledgeBase(workspaceId: string, kbId: string): Promise<KbIntegrityReport> {
    const issues: KbIntegrityIssue[] = [];

    const orphanChunks = await this.prisma.client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT c.id FROM kb_chunks c
      LEFT JOIN kb_documents d ON d.id = c."documentId"
      WHERE c."workspaceId" = ${workspaceId}
        AND c."knowledgeBaseId" = ${kbId}
        AND (d.id IS NULL OR d."deletedAt" IS NOT NULL)
      LIMIT 100
    `);
    if (orphanChunks.length > 0) {
      issues.push({
        code: 'ORPHAN_CHUNKS',
        severity: 'critical',
        count: orphanChunks.length,
        message: 'Chunks reference missing or deleted documents',
        sampleIds: orphanChunks.slice(0, 5).map((r) => r.id),
      });
    }

    const missingEmbeddings = await this.prisma.client.kbChunk.count({
      where: { workspaceId, knowledgeBaseId: kbId, hasEmbedding: false },
    });
    if (missingEmbeddings > 0) {
      issues.push({
        code: 'MISSING_EMBEDDINGS',
        severity: 'warning',
        count: missingEmbeddings,
        message: 'Chunks without embeddings',
      });
    }

    const indexedWithMissing = await this.prisma.client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT d.id FROM kb_documents d
      WHERE d."workspaceId" = ${workspaceId}
        AND d."knowledgeBaseId" = ${kbId}
        AND d."deletedAt" IS NULL
        AND d.status = 'INDEXED'
        AND EXISTS (
          SELECT 1 FROM kb_chunks c
          WHERE c."documentId" = d.id AND c."hasEmbedding" = false
        )
      LIMIT 50
    `);
    if (indexedWithMissing.length > 0) {
      issues.push({
        code: 'INDEXED_PARTIAL_EMBED',
        severity: 'warning',
        count: indexedWithMissing.length,
        message: 'INDEXED documents with unembedded chunks',
        sampleIds: indexedWithMissing.slice(0, 5).map((r) => r.id),
      });
    }

    const stuckDocs = await this.prisma.client.kbDocument.count({
      where: {
        workspaceId,
        knowledgeBaseId: kbId,
        deletedAt: null,
        status: { in: ['PARSING', 'CHUNKING', 'EMBEDDING', 'QUEUED', 'UPLOADED'] },
        updatedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
      },
    });
    if (stuckDocs > 0) {
      issues.push({
        code: 'STUCK_DOCUMENTS',
        severity: 'warning',
        count: stuckDocs,
        message: 'Documents stuck in intermediate status >30min',
      });
    }

    const kb = await this.prisma.client.knowledgeBase.findFirst({
      where: { id: kbId, workspaceId, deletedAt: null },
    });
    const actualChunks = await this.prisma.client.kbChunk.count({
      where: { workspaceId, knowledgeBaseId: kbId },
    });
    const actualDocs = await this.prisma.client.kbDocument.count({
      where: { workspaceId, knowledgeBaseId: kbId, deletedAt: null, status: 'INDEXED' },
    });
    const actualTokens = await this.prisma.client.kbChunk.aggregate({
      where: { workspaceId, knowledgeBaseId: kbId },
      _sum: { tokenCount: true },
    });

    const counterDrift =
      !!kb &&
      (kb.chunkCount !== actualChunks ||
        kb.documentCount !== actualDocs ||
        kb.tokenCount !== (actualTokens._sum.tokenCount ?? 0));

    if (counterDrift) {
      issues.push({
        code: 'COUNTER_DRIFT',
        severity: 'warning',
        count: 1,
        message: `KB counters drift: stored=${kb?.chunkCount}/${kb?.documentCount}/${kb?.tokenCount} actual=${actualChunks}/${actualDocs}/${actualTokens._sum.tokenCount ?? 0}`,
      });
    }

    const embeddedChunks = await this.prisma.client.kbChunk.count({
      where: { workspaceId, knowledgeBaseId: kbId, hasEmbedding: true },
    });

    const crossWorkspace = await this.prisma.client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT c.id FROM kb_chunks c
      INNER JOIN kb_documents d ON d.id = c."documentId"
      WHERE c."knowledgeBaseId" = ${kbId}
        AND c."workspaceId" != d."workspaceId"
      LIMIT 10
    `);
    if (crossWorkspace.length > 0) {
      issues.push({
        code: 'CROSS_WORKSPACE_REF',
        severity: 'critical',
        count: crossWorkspace.length,
        message: 'Tenant isolation violation: chunk/document workspace mismatch',
        sampleIds: crossWorkspace.map((r) => r.id),
      });
    }

    return {
      knowledgeBaseId: kbId,
      checkedAt: new Date().toISOString(),
      healthy: issues.filter((i) => i.severity === 'critical').length === 0,
      issues,
      stats: {
        documents: actualDocs,
        chunks: actualChunks,
        embeddedChunks,
        orphanChunks: orphanChunks.length,
        stuckDocuments: stuckDocs,
        counterDrift,
      },
    };
  }
}
