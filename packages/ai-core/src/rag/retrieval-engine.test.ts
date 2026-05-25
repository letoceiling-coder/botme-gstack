import { describe, expect, it } from 'vitest';
import {
  adaptTopK,
  adaptThreshold,
  computeRetrievalConfidence,
  semanticRerank,
} from './retrieval-engine.js';

describe('retrieval-engine', () => {
  it('adapts topK for short queries', () => {
    expect(adaptTopK('price', 8)).toBe(10);
    expect(adaptTopK('a b c d e f g h i j k l m', 8)).toBe(6);
  });

  it('lowers threshold when top score weak', () => {
    expect(adaptThreshold([0.58, 0.55], 0.72)).toBeLessThan(0.72);
  });

  it('computes high confidence', () => {
    const c = computeRetrievalConfidence([
      { score: 0.91 },
      { score: 0.85 },
      { score: 0.78 },
    ]);
    expect(c.level).toBe('high');
    expect(c.score).toBeGreaterThan(0.8);
  });

  it('computes none confidence for empty hits', () => {
    const c = computeRetrievalConfidence([]);
    expect(c.level).toBe('none');
  });

  it('reranks by term overlap', () => {
    const hits = semanticRerank(
      [
        { chunkId: 'a', content: 'unrelated text', score: 0.8, vectorScore: 0.8, keywordBoost: 0 },
        { chunkId: 'b', content: 'pricing plans and subscription tiers', score: 0.75, vectorScore: 0.75, keywordBoost: 0 },
      ],
      'pricing subscription',
    );
    expect(hits[0]!.chunkId).toBe('b');
  });
});
