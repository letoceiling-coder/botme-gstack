import { describe, expect, it } from 'vitest';
import { scoreChunkQuality, scoreDocumentChunks } from './quality-score.js';
import type { SmartChunk } from './types.js';

function chunk(index: number, content: string, meta: SmartChunk['metadata'] = {}): SmartChunk {
  return {
    chunkIndex: index,
    content,
    tokenCount: Math.ceil(content.length / 4),
    contentHash: `hash-${index}`,
    metadata: meta,
  };
}

describe('chunk quality score', () => {
  it('scores complete FAQ chunk highly', () => {
    const chunks = [
      chunk(0, '**What is Botme?**\n\nBotme is an AI assistant platform for businesses.', {
        isFaqPair: true,
        sectionTitle: 'FAQ',
      }),
    ];
    const score = scoreChunkQuality(chunks[0]!, chunks);
    expect(score.overall).toBeGreaterThan(0.7);
    expect(score.retrievalReadiness).toBeGreaterThan(0.7);
  });

  it('flags high duplication risk', () => {
    const text = 'Same content repeated for testing duplication detection in chunks.';
    const chunks = [chunk(0, text), chunk(1, text)];
    const score = scoreChunkQuality(chunks[1]!, chunks);
    expect(score.duplicationRisk).toBeGreaterThan(0.3);
  });

  it('audits document chunk set', () => {
    const chunks = [
      chunk(0, '# Intro\n\nThis is a complete paragraph about the product.'),
      chunk(1, '## Features\n\nFeature one does X. Feature two does Y.'),
    ];
    const audit = scoreDocumentChunks(chunks);
    expect(audit.chunkCount).toBe(2);
    expect(audit.averageQuality).toBeGreaterThan(0.5);
  });
});
