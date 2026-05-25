import { Injectable, Logger } from '@nestjs/common';
import { estimateTokens } from '@botme/ai-core';
import type { RetrieveTestResultDto } from '@botme/shared';
import { KbRetrievalOrchestrator } from './kb-retrieval-orchestrator.service';

@Injectable()
export class KbRetrievalTestService {
  private readonly logger = new Logger(KbRetrievalTestService.name);

  constructor(private readonly orchestrator: KbRetrievalOrchestrator) {}

  async testRetrieval(
    workspaceId: string,
    kbId: string,
    query: string,
    topK?: number,
    minScore?: number,
  ): Promise<RetrieveTestResultDto> {
    const result = await this.orchestrator.retrieve({
      workspaceId,
      knowledgeBaseIds: [kbId],
      query,
      baseSystemPrompt: '',
      retrievalTokenBudget: 4000,
      topK,
      minScore,
    });

    const { diagnostics } = result;

    return {
      query,
      embeddingLatencyMs: diagnostics.embeddingLatencyMs,
      searchLatencyMs: diagnostics.searchLatencyMs,
      promptPreview: result.systemPrompt,
      promptTokenEstimate: estimateTokens(result.systemPrompt),
      truncated: diagnostics.hitCount > result.citations.length,
      retrievalConfidence: diagnostics.confidence.level,
      confidenceScore: diagnostics.confidence.score,
      embeddingModelUsed: diagnostics.embeddingModelId,
      hits: diagnostics.hits.map((h) => ({
        chunkId: h.chunkId,
        documentId: h.documentId,
        documentTitle: h.documentTitle,
        content: h.content,
        score: h.score,
        sourcePage: h.sourcePage,
        sourceSection: h.sourceSection,
        matchReason: buildMatchReason(h.score, h.sourceSection, h.sourcePage),
      })),
      citations: result.citations,
      diagnostics: {
        topScore: diagnostics.confidence.topScore,
        avgScore: diagnostics.confidence.avgScore,
        spread: diagnostics.confidence.spread,
        chunkIds: diagnostics.chunkIds,
        scores: diagnostics.scores,
        embeddingIntegrationId: diagnostics.embeddingIntegrationId,
      },
    };
  }
}

function buildMatchReason(score: number, section: string | null, page: number | null): string {
  const parts = [`score=${score.toFixed(3)}`];
  if (section) parts.push(`section="${section}"`);
  if (page) parts.push(`page=${page}`);
  return parts.join(', ');
}
