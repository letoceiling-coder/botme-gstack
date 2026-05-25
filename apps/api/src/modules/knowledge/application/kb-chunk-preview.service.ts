import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  estimateTokens,
  extractDocumentMetadata,
  previewChunks,
  previewSmartChunks,
} from '@botme/ai-core';
import type { PreviewChunksResultDto } from '@botme/shared';

const MAX_PREVIEW_BYTES = 500_000;

@Injectable()
export class KbChunkPreviewService {
  private readonly logger = new Logger(KbChunkPreviewService.name);

  preview(
    workspaceId: string,
    kbId: string,
    content: string,
    mimeType: 'text/plain' | 'text/markdown',
    chunkSize: number,
    chunkOverlap: number,
  ): PreviewChunksResultDto {
    const normalized = content ?? '';
    if (Buffer.byteLength(normalized, 'utf8') > MAX_PREVIEW_BYTES) {
      throw new BadRequestException('Текст слишком большой для предпросмотра (max 500KB)');
    }

    const safeContent = normalized.trim() || ' ';
    const config = {
      maxChunkTokens: Math.max(128, Math.min(chunkSize, 4000)),
      overlapTokens: Math.max(0, Math.min(chunkOverlap, 1000)),
    };

    let chunks: Array<{
      chunkIndex: number;
      tokenCount: number;
      content: string;
      sourceSection?: string;
      metadata?: { topic?: string; sectionTitle?: string };
    }> = [];
    let strategy = 'smart';
    let fallback = false;

    try {
      if (typeof previewSmartChunks === 'function') {
        chunks = previewSmartChunks(safeContent, mimeType, config);
      } else {
        throw new TypeError('previewSmartChunks unavailable');
      }
    } catch (err: unknown) {
      fallback = true;
      strategy = 'fixed';
      this.logger.warn(
        `preview fallback kbId=${kbId} workspaceId=${workspaceId} reason=${err instanceof Error ? err.message : 'unknown'}`,
      );
      try {
        chunks = previewChunks(safeContent, mimeType, config);
      } catch (inner: unknown) {
        this.logger.error(
          `preview failed kbId=${kbId} workspaceId=${workspaceId} reason=${inner instanceof Error ? inner.message : 'unknown'}`,
        );
        return {
          tokenCount: estimateTokens(safeContent),
          chunkCount: 0,
          chunks: [],
          metadata: {},
          stats: { strategy: 'empty', fallback: true, error: 'chunk_preview_failed' },
        };
      }
    }

    let metadata: Record<string, unknown> = {};
    try {
      metadata = extractDocumentMetadata(safeContent, mimeType) as Record<string, unknown>;
    } catch {
      metadata = {};
    }

    return {
      tokenCount: estimateTokens(safeContent),
      chunkCount: chunks.length,
      chunks: chunks.slice(0, 10).map((c) => ({
        chunkIndex: c.chunkIndex,
        tokenCount: c.tokenCount,
        preview: c.content.slice(0, 200),
        topic: c.metadata?.topic ?? null,
        section: c.sourceSection ?? c.metadata?.sectionTitle ?? null,
      })),
      metadata,
      stats: {
        strategy,
        fallback,
        previewLimit: 10,
      },
    };
  }
}
