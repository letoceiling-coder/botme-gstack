import { Injectable, Logger } from '@nestjs/common';
import {
  assembleRagPrompt,
  computeRetrievalConfidence,
  sanitizeRetrievedContent,
  type RetrievedChunk,
  type RetrievalConfidenceResult,
} from '@botme/ai-core';
import type { CitationDto } from '@botme/shared';
import { KnowledgeBaseRepository } from '../infrastructure/knowledge-base.repository';
import { VectorSearchService } from '../infrastructure/vector-search.service';
import { KnowledgeBaseModelRouter } from './knowledge-base-model-router.service';

export interface RagRetrievalDiagnostics {
  confidence: RetrievalConfidenceResult;
  embeddingModelId: string;
  embeddingIntegrationId: string;
  embeddingLatencyMs: number;
  searchLatencyMs: number;
  chunkIds: string[];
  scores: number[];
  hitCount: number;
  hits: Array<{
    chunkId: string;
    documentId: string;
    documentTitle: string;
    content: string;
    score: number;
    sourcePage: number | null;
    sourceSection: string | null;
  }>;
}

export interface RagRetrievalResult {
  systemPrompt: string;
  citations: CitationDto[];
  diagnostics: RagRetrievalDiagnostics;
}

@Injectable()
export class KbRetrievalOrchestrator {
  private readonly logger = new Logger(KbRetrievalOrchestrator.name);

  constructor(
    private readonly knowledgeBases: KnowledgeBaseRepository,
    private readonly vectors: VectorSearchService,
    private readonly modelRouter: KnowledgeBaseModelRouter,
  ) {}

  async retrieve(params: {
    workspaceId: string;
    knowledgeBaseIds: string[];
    query: string;
    baseSystemPrompt: string;
    retrievalTokenBudget?: number;
    topK?: number;
    minScore?: number;
  }): Promise<RagRetrievalResult> {
    const emptyConfidence = computeRetrievalConfidence([]);
    const emptyDiag: RagRetrievalDiagnostics = {
      confidence: emptyConfidence,
      embeddingModelId: '',
      embeddingIntegrationId: '',
      embeddingLatencyMs: 0,
      searchLatencyMs: 0,
      chunkIds: [],
      scores: [],
      hitCount: 0,
      hits: [],
    };

    if (params.knowledgeBaseIds.length === 0) {
      return {
        systemPrompt: params.baseSystemPrompt,
        citations: [],
        diagnostics: emptyDiag,
      };
    }

    const kb = await this.knowledgeBases.findById(params.workspaceId, params.knowledgeBaseIds[0]!);
    if (!kb) {
      return {
        systemPrompt: params.baseSystemPrompt,
        citations: [],
        diagnostics: emptyDiag,
      };
    }

    const embedStart = Date.now();
    const embedResult = await this.modelRouter.embedWithFallback(
      params.workspaceId,
      [params.query],
      kb.embeddingModelId,
    );
    const queryVector = embedResult.embeddings[0];
    const embeddingLatencyMs = Date.now() - embedStart;

    if (!queryVector) {
      return {
        systemPrompt: params.baseSystemPrompt,
        citations: [],
        diagnostics: {
          ...emptyDiag,
          embeddingModelId: embedResult.modelId,
          embeddingIntegrationId: embedResult.integrationId,
          embeddingLatencyMs,
        },
      };
    }

    const searchStart = Date.now();
    const hits = await this.vectors.search({
      workspaceId: params.workspaceId,
      knowledgeBaseIds: params.knowledgeBaseIds,
      queryVector,
      queryText: params.query,
      topK: params.topK ?? kb.retrievalTopK,
      minScore: params.minScore ?? kb.similarityThreshold,
      hybridEnabled: kb.hybridRetrievalEnabled,
      rerankEnabled: kb.rerankEnabled,
      dynamicTopK: true,
      adaptiveThreshold: true,
    });
    const searchLatencyMs = Date.now() - searchStart;

    const confidence = computeRetrievalConfidence(hits);

    const retrieved: RetrievedChunk[] = hits.map((h) => ({
      chunkId: h.chunkId,
      documentId: h.documentId,
      filename: h.documentTitle || h.filename,
      content: sanitizeRetrievedContent(h.content),
      score: h.score,
      sourcePage: h.sourcePage,
      sourceSection: h.sourceSection,
    }));

    let systemPrompt = params.baseSystemPrompt;
    let citations: CitationDto[] = [];

    if (confidence.level !== 'none') {
      const assembled = assembleRagPrompt(
        params.baseSystemPrompt,
        retrieved,
        params.retrievalTokenBudget ?? 2000,
      );
      systemPrompt = assembled.systemPrompt;
      citations = assembled.citations;
    } else {
      systemPrompt = [
        params.baseSystemPrompt,
        '',
        '--- Knowledge base note ---',
        'No sufficiently relevant knowledge was retrieved for this query. Answer from general capability or ask for clarification. Do not invent facts from the knowledge base.',
      ].join('\n');
    }

    const diagnostics: RagRetrievalDiagnostics = {
      confidence,
      embeddingModelId: embedResult.modelId,
      embeddingIntegrationId: embedResult.integrationId,
      embeddingLatencyMs,
      searchLatencyMs,
      chunkIds: hits.map((h) => h.chunkId),
      scores: hits.map((h) => h.score),
      hitCount: hits.length,
      hits: hits.map((h) => ({
        chunkId: h.chunkId,
        documentId: h.documentId,
        documentTitle: h.documentTitle,
        content: h.content,
        score: h.score,
        sourcePage: h.sourcePage,
        sourceSection: h.sourceSection,
      })),
    };

    this.logger.log(
      `RAG retrieve workspace=${params.workspaceId} kbs=${params.knowledgeBaseIds.length} confidence=${confidence.level} hits=${hits.length} top=${confidence.topScore} embedMs=${embeddingLatencyMs} searchMs=${searchLatencyMs} model=${embedResult.modelId}`,
    );

    return { systemPrompt, citations, diagnostics };
  }
}
