import { createHash } from 'node:crypto';
import type { ChunkInput } from '../chunker.js';
import { estimateTokens } from '../chunker.js';
import type { SmartChunk, ChunkMetadata } from './types.js';

const CHARS_PER_TOKEN = 4;

export function resolveTokenLimits(maxChunkTokens = 700, overlapTokens = 100) {
  return {
    maxChunkChars: maxChunkTokens * CHARS_PER_TOKEN,
    overlapChars: overlapTokens * CHARS_PER_TOKEN,
  };
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 32);
}

export function splitSegmentWithOverlap(
  text: string,
  segment: ChunkInput,
  config: { maxChunkChars: number; overlapChars: number },
  startChunkIndex: number,
  globalOffset: number,
  metadata: ChunkMetadata = {},
): { chunks: SmartChunk[]; nextIndex: number; nextGlobalOffset: number } {
  const chunks: SmartChunk[] = [];
  let chunkIndex = startChunkIndex;
  let offset = globalOffset;
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + config.maxChunkChars, text.length);

    if (end < text.length) {
      const slice = text.slice(start, end);
      const breaks = [
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('\n- '),
        slice.lastIndexOf('. '),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('! '),
      ];
      const lastBreak = Math.max(...breaks);
      if (lastBreak > config.maxChunkChars * 0.45) {
        end = start + lastBreak + 1;
      }
    }

    const content = text.slice(start, end).trim();
    if (content.length > 0) {
      const startOffset = offset + start;
      const endOffset = offset + end;
      chunks.push({
        content,
        tokenCount: estimateTokens(content),
        chunkIndex: chunkIndex++,
        sourcePage: segment.sourcePage,
        sourceSection: segment.sourceSection ?? metadata.sectionTitle,
        startOffset,
        endOffset,
        contentHash: hashContent(content),
        metadata: { ...metadata },
      });
    }

    if (end >= text.length) break;
    start = Math.max(end - config.overlapChars, start + 1);
  }

  return { chunks, nextIndex: chunkIndex, nextGlobalOffset: offset + text.length + 2 };
}
