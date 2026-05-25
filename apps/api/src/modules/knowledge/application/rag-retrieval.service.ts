import { Injectable, Logger } from '@nestjs/common';
import type { CitationDto } from '@botme/shared';
import { KbRetrievalOrchestrator } from './kb-retrieval-orchestrator.service';

@Injectable()
export class RagRetrievalService {
  private readonly logger = new Logger(RagRetrievalService.name);

  constructor(private readonly orchestrator: KbRetrievalOrchestrator) {}

  async retrieve(params: {
    workspaceId: string;
    knowledgeBaseIds: string[];
    query: string;
    baseSystemPrompt: string;
    retrievalTokenBudget?: number;
  }): Promise<{ systemPrompt: string; citations: CitationDto[] }> {
    try {
      const result = await this.orchestrator.retrieve(params);
      if (result.diagnostics.confidence.level === 'none') {
        this.logger.warn(
          `RAG low confidence workspace=${params.workspaceId} query="${params.query.slice(0, 80)}"`,
        );
      }
      return { systemPrompt: result.systemPrompt, citations: result.citations };
    } catch (err: unknown) {
      this.logger.warn(`RAG retrieval failed: ${err instanceof Error ? err.message : 'unknown'}`);
      return { systemPrompt: params.baseSystemPrompt, citations: [] };
    }
  }
}
