import { Injectable } from '@nestjs/common';
import { Prisma } from '@botme/database';
import { applyHybridScores, deduplicateHits, semanticRerank, adaptThreshold, adaptTopK } from '@botme/ai-core';
import { PrismaService } from '../../../core/prisma/prisma.service';

export interface VectorSearchHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  filename: string;
  content: string;
  score: number;
  vectorScore: number;
  keywordBoost: number;
  sourcePage: number | null;
  sourceSection: string | null;
  topic: string | null;
  hierarchyLevel: number;
  parentChunkId: string | null;
}

export interface VectorSearchParams {
  workspaceId: string;
  knowledgeBaseIds: string[];
  queryVector: number[];
  queryText?: string;
  topK?: number;
  minScore?: number;
  hybridEnabled?: boolean;
  rerankEnabled?: boolean;
  adaptiveThreshold?: boolean;
  dynamicTopK?: boolean;
  filters?: {
    category?: string;
    tags?: string[];
    documentType?: string;
    language?: string;
  };
}

@Injectable()
export class VectorSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(params: VectorSearchParams): Promise<VectorSearchHit[]> {
    if (params.knowledgeBaseIds.length === 0) return [];

    const topK = params.dynamicTopK !== false
      ? adaptTopK(params.queryText ?? '', params.topK ?? 8)
      : (params.topK ?? 8);
    const baseMinScore = params.minScore ?? 0.72;
    const fetchLimit = Math.min(topK * 4, 80);
    const vectorLiteral = `[${params.queryVector.join(',')}]`;
    const kbIds = Prisma.join(params.knowledgeBaseIds.map((id) => Prisma.sql`${id}`));
    const filterSql = this.buildFilterSql(params.filters);

    const rows = await this.prisma.client.$queryRaw<
      Array<{
        chunkId: string;
        documentId: string;
        documentTitle: string;
        filename: string;
        content: string;
        vectorScore: number;
        sourcePage: number | null;
        sourceSection: string | null;
        topic: string | null;
        hierarchyLevel: number;
        parentChunkId: string | null;
        documentType: string | null;
      }>
    >(Prisma.sql`
      SELECT
        c.id AS "chunkId",
        c."documentId" AS "documentId",
        COALESCE(NULLIF(d.title, ''), d.filename) AS "documentTitle",
        d.filename AS filename,
        c.content AS content,
        1 - (c.embedding <=> ${vectorLiteral}::vector) AS "vectorScore",
        c."sourcePage" AS "sourcePage",
        c."sourceSection" AS "sourceSection",
        c.topic AS topic,
        c."hierarchyLevel" AS "hierarchyLevel",
        c."parentChunkId" AS "parentChunkId",
        d."documentType" AS "documentType"
      FROM kb_chunks c
      INNER JOIN kb_documents d ON d.id = c."documentId"
      INNER JOIN knowledge_bases kb ON kb.id = c."knowledgeBaseId"
      WHERE c."workspaceId" = ${params.workspaceId}
        AND c."knowledgeBaseId" IN (${kbIds})
        AND d."deletedAt" IS NULL
        AND d.status = 'INDEXED'
        AND kb."deletedAt" IS NULL
        AND kb.status = 'ACTIVE'
        AND c.embedding IS NOT NULL
        ${filterSql}
      ORDER BY c.embedding <=> ${Prisma.raw(`'${vectorLiteral}'`)}::vector
      LIMIT ${fetchLimit}
    `);

    const scored = applyHybridScores(rows, params.queryText ?? '', params.hybridEnabled !== false);
    const withIds = scored.map((r, i) => ({
      ...r,
      chunkId: rows[i]?.chunkId ?? '',
      documentId: rows[i]?.documentId ?? '',
      documentTitle: rows[i]?.documentTitle ?? '',
      filename: rows[i]?.filename ?? '',
      sourcePage: rows[i]?.sourcePage ?? null,
      sourceSection: rows[i]?.sourceSection ?? null,
      topic: rows[i]?.topic ?? null,
      hierarchyLevel: rows[i]?.hierarchyLevel ?? 0,
      parentChunkId: rows[i]?.parentChunkId ?? null,
    }));
    const reranked =
      params.rerankEnabled !== false
        ? semanticRerank(
            withIds.map((r) => ({
              chunkId: r.chunkId,
              content: r.content,
              score: r.score,
              vectorScore: r.vectorScore,
              keywordBoost: r.keywordBoost,
              sourceSection: r.sourceSection,
              topic: r.topic,
            })),
            params.queryText ?? '',
          ).map((r) => {
            const orig = withIds.find((h) => h.chunkId === r.chunkId)!;
            return { ...orig, score: r.score };
          })
        : withIds;
    const deduped = deduplicateHits(reranked);
    const minScore =
      params.adaptiveThreshold !== false
        ? adaptThreshold(
            deduped.map((r) => r.score),
            baseMinScore,
          )
        : baseMinScore;
    const filtered = deduped.filter((r) => r.score >= minScore);
    const withParents = await this.attachParentChunks(params.workspaceId, filtered);
    return withParents.slice(0, topK);
  }

  private buildFilterSql(filters?: VectorSearchParams['filters']): Prisma.Sql {
    if (!filters) return Prisma.empty;
    const parts: Prisma.Sql[] = [];
    if (filters.category) parts.push(Prisma.sql`AND d.category = ${filters.category}`);
    if (filters.documentType) parts.push(Prisma.sql`AND d."documentType" = ${filters.documentType}`);
    if (filters.language) parts.push(Prisma.sql`AND d.language = ${filters.language}`);
    if (filters.tags?.length) parts.push(Prisma.sql`AND c.tags && ${filters.tags}::text[]`);
    return parts.length ? Prisma.join(parts, ' ') : Prisma.empty;
  }

  private async attachParentChunks(
    workspaceId: string,
    hits: VectorSearchHit[],
  ): Promise<VectorSearchHit[]> {
    const parentIds = [...new Set(hits.map((h) => h.parentChunkId).filter(Boolean))] as string[];
    if (parentIds.length === 0) return hits;

    const parents = await this.prisma.client.kbChunk.findMany({
      where: { workspaceId, id: { in: parentIds } },
      select: { id: true, content: true, sourceSection: true },
    });
    const parentMap = new Map(parents.map((p) => [p.id, p]));

    return hits.map((hit) => {
      if (!hit.parentChunkId) return hit;
      const parent = parentMap.get(hit.parentChunkId);
      if (!parent) return hit;
      return {
        ...hit,
        content: `${parent.content}\n\n${hit.content}`.slice(0, 8000),
        sourceSection: hit.sourceSection ?? parent.sourceSection,
      };
    });
  }
}
