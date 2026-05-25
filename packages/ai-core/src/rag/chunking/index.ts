import type { ChunkerConfig } from '../chunker.js';
import { chunkPdfPages } from '../chunker.js';
import type { SmartChunk, SmartChunkOptions, DocumentMetadata } from './types.js';
import { extractFaqPairs } from './faq.js';
import { parseMarkdownBlocks } from './markdown.js';
import { extractDocumentMetadata } from './enrich.js';
import { resolveTokenLimits, splitSegmentWithOverlap, hashContent } from './token-aware.js';

export * from './types.js';
export { extractDocumentMetadata, detectDocumentKind } from './enrich.js';
export { parseMarkdownBlocks } from './markdown.js';
export { extractFaqPairs, isLikelyFaqDocument } from './faq.js';
export { scoreChunkQuality, scoreDocumentChunks, type ChunkQualityScore } from './quality-score.js';

export function smartChunk(
  text: string,
  mimeType: string,
  config?: ChunkerConfig & SmartChunkOptions,
): SmartChunk[] {
  const limits = resolveTokenLimits(config?.maxChunkTokens, config?.overlapTokens);
  const trimmed = text.trim();
  if (!trimmed) return [];

  const docMeta = extractDocumentMetadata(trimmed, mimeType);
  const documentType = config?.documentType ?? docMeta.documentType ?? 'general';

  if (documentType === 'faq' || docMeta.documentType === 'faq') {
    return chunkFaq(trimmed, limits, docMeta);
  }

  if (mimeType === 'text/markdown' || documentType === 'markdown') {
    return chunkMarkdownSmart(trimmed, limits, docMeta);
  }

  return chunkPlainSmart(trimmed, limits, docMeta);
}

function chunkFaq(
  text: string,
  limits: ReturnType<typeof resolveTokenLimits>,
  docMeta: DocumentMetadata,
): SmartChunk[] {
  const pairs = extractFaqPairs(text);
  const chunks: SmartChunk[] = [];
  let index = 0;

  for (const pair of pairs) {
    const content = `**${pair.question}**\n\n${pair.answer}`.trim();
    chunks.push({
      content,
      tokenCount: Math.ceil(content.length / 4),
      chunkIndex: index++,
      sourceSection: pair.question,
      startOffset: 0,
      endOffset: content.length,
      contentHash: hashContent(content),
      metadata: {
        isFaqPair: true,
        topic: pair.question,
        sectionTitle: pair.question,
        documentType: 'faq',
        tags: ['faq', ...(docMeta.tags ?? [])],
        hierarchyLevel: 1,
        retrievalHint: pair.question,
      },
    });
  }

  if (chunks.length > 0) return chunks;
  return chunkPlainSmart(text, limits, docMeta);
}

function chunkMarkdownSmart(
  text: string,
  limits: ReturnType<typeof resolveTokenLimits>,
  docMeta: DocumentMetadata,
): SmartChunk[] {
  const blocks = parseMarkdownBlocks(text);
  const chunks: SmartChunk[] = [];
  let chunkIndex = 0;
  let globalOffset = 0;
  const sectionParents = new Map<string, number>();

  for (const block of blocks) {
    if (block.kind === 'heading') {
      const content = block.text;
      sectionParents.set(block.section ?? content, chunkIndex);
      chunks.push({
        content,
        tokenCount: Math.ceil(content.length / 4),
        chunkIndex: chunkIndex++,
        sourceSection: block.section,
        startOffset: globalOffset,
        endOffset: globalOffset + content.length,
        contentHash: hashContent(content),
        metadata: {
          sectionTitle: block.section,
          hierarchyLevel: block.level ?? 1,
          documentType: 'markdown',
          tags: docMeta.tags,
          topic: docMeta.topic,
        },
      });
      globalOffset += content.length + 1;
      continue;
    }

    const isAtomic = block.kind === 'code' || block.kind === 'table';
    const meta = {
      sectionTitle: block.section,
      hierarchyLevel: (block.level ?? 0) + 1,
      documentType: docMeta.documentType,
      tags: docMeta.tags,
      topic: docMeta.topic,
      isCodeBlock: block.kind === 'code',
      isTable: block.kind === 'table',
      parentSectionIndex: block.section ? sectionParents.get(block.section) : undefined,
    };

    if (isAtomic && block.text.length <= limits.maxChunkChars) {
      chunks.push({
        content: block.text,
        tokenCount: Math.ceil(block.text.length / 4),
        chunkIndex: chunkIndex++,
        sourceSection: block.section,
        startOffset: globalOffset,
        endOffset: globalOffset + block.text.length,
        contentHash: hashContent(block.text),
        metadata: meta,
        parentChunkIndex: meta.parentSectionIndex,
      });
      globalOffset += block.text.length + 2;
      continue;
    }

    const segment = { text: block.text, sourceSection: block.section };
    const result = splitSegmentWithOverlap(
      block.text,
      segment,
      limits,
      chunkIndex,
      globalOffset,
      meta,
    );
    for (const c of result.chunks) {
      c.parentChunkIndex = meta.parentSectionIndex;
      c.metadata.hierarchyLevel = meta.hierarchyLevel;
    }
    chunks.push(...result.chunks);
    chunkIndex = result.nextIndex;
    globalOffset = result.nextGlobalOffset;
  }

  if (chunks.length === 0) {
    return chunkPlainSmart(text, limits, docMeta);
  }

  return chunks;
}

function chunkPlainSmart(
  text: string,
  limits: ReturnType<typeof resolveTokenLimits>,
  docMeta: DocumentMetadata,
): SmartChunk[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: SmartChunk[] = [];
  let chunkIndex = 0;
  let globalOffset = 0;

  for (const paragraph of paragraphs) {
    const meta = {
      documentType: docMeta.documentType,
      tags: docMeta.tags,
      topic: docMeta.topic,
      hierarchyLevel: 1,
    };
    const result = splitSegmentWithOverlap(
      paragraph,
      { text: paragraph },
      limits,
      chunkIndex,
      globalOffset,
      meta,
    );
    chunks.push(...result.chunks);
    chunkIndex = result.nextIndex;
    globalOffset = result.nextGlobalOffset;
  }

  return chunks;
}

export function smartChunkPdfPages(pages: string[], config?: ChunkerConfig): SmartChunk[] {
  const legacy = chunkPdfPages(pages, config);
  return legacy.map((c) => ({
    ...c,
    metadata: { documentType: 'pdf', hierarchyLevel: 1 },
  }));
}

export function previewSmartChunks(
  text: string,
  mimeType: string,
  config?: ChunkerConfig,
): SmartChunk[] {
  return smartChunk(text, mimeType, config);
}
