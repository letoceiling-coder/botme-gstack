import { createHash } from 'node:crypto';

export interface ChunkInput {
  text: string;
  sourcePage?: number;
  sourceSection?: string;
}

export interface TextChunk {
  content: string;
  tokenCount: number;
  chunkIndex: number;
  sourcePage?: number;
  sourceSection?: string;
  startOffset: number;
  endOffset: number;
  contentHash: string;
}

const CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_CHUNK_TOKENS = 700;
const DEFAULT_OVERLAP_TOKENS = 100;

export interface ChunkerConfig {
  maxChunkTokens?: number;
  overlapTokens?: number;
}

function resolveChunkerConfig(config?: ChunkerConfig) {
  const maxChunkTokens = config?.maxChunkTokens ?? DEFAULT_MAX_CHUNK_TOKENS;
  const overlapTokens = config?.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  return {
    maxChunkChars: maxChunkTokens * CHARS_PER_TOKEN,
    overlapChars: overlapTokens * CHARS_PER_TOKEN,
  };
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 32);
}

export function chunkPlainText(text: string, config?: ChunkerConfig): TextChunk[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return chunkSegments(paragraphs.map((p) => ({ text: p })), config);
}

export function chunkMarkdown(text: string, config?: ChunkerConfig): TextChunk[] {
  const segments: ChunkInput[] = [];
  let currentSection = '';
  const lines = text.split('\n');
  let buffer: string[] = [];

  const flush = () => {
    const joined = buffer.join('\n').trim();
    if (joined) {
      segments.push({ text: joined, sourceSection: currentSection || undefined });
    }
    buffer = [];
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flush();
      currentSection = heading[2]?.trim() ?? '';
      continue;
    }
    buffer.push(line);
  }
  flush();

  if (segments.length === 0 && text.trim()) {
    return chunkPlainText(text, config);
  }

  return chunkSegments(segments, config);
}

export function chunkPdfPages(pages: string[], config?: ChunkerConfig): TextChunk[] {
  const segments: ChunkInput[] = pages.map((pageText, index) => ({
    text: pageText.trim(),
    sourcePage: index + 1,
  }));
  return chunkSegments(
    segments.filter((s) => s.text.length > 0),
    config,
  );
}

function chunkSegments(segments: ChunkInput[], config?: ChunkerConfig): TextChunk[] {
  const { maxChunkChars, overlapChars } = resolveChunkerConfig(config);
  const chunks: TextChunk[] = [];
  let globalOffset = 0;
  let chunkIndex = 0;

  for (const segment of segments) {
    const text = segment.text;
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + maxChunkChars, text.length);

      if (end < text.length) {
        const slice = text.slice(start, end);
        const lastBreak = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '));
        if (lastBreak > maxChunkChars * 0.5) {
          end = start + lastBreak + 1;
        }
      }

      const content = text.slice(start, end).trim();
      if (content.length > 0) {
        const startOffset = globalOffset + start;
        const endOffset = globalOffset + end;
        chunks.push({
          content,
          tokenCount: estimateTokens(content),
          chunkIndex: chunkIndex++,
          sourcePage: segment.sourcePage,
          sourceSection: segment.sourceSection,
          startOffset,
          endOffset,
          contentHash: hashContent(content),
        });
      }

      if (end >= text.length) break;
      start = Math.max(end - overlapChars, start + 1);
    }

    globalOffset += text.length + 2;
  }

  return chunks;
}

export function previewChunks(
  text: string,
  mimeType: string,
  config?: ChunkerConfig,
): TextChunk[] {
  if (mimeType === 'text/markdown') return chunkMarkdown(text, config);
  return chunkPlainText(text, config);
}
