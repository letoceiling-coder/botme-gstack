import { describe, expect, it } from 'vitest';
import { KbChunkPreviewService } from './kb-chunk-preview.service.js';

describe('KbChunkPreviewService', () => {
  const svc = new KbChunkPreviewService();

  it('never throws on empty content', () => {
    const result = svc.preview('ws', 'kb', '', 'text/markdown', 700, 100);
    expect(result.chunkCount).toBeGreaterThanOrEqual(0);
    expect(result.stats).toBeDefined();
  });

  it('previews markdown without crashing', () => {
    const md = '# Title\n\n```ts\nconst x = 1;\n```\n\nParagraph.';
    const result = svc.preview('ws', 'kb', md, 'text/markdown', 700, 100);
    expect(result.tokenCount).toBeGreaterThan(0);
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it('handles malformed markdown safely', () => {
    const result = svc.preview('ws', 'kb', '###\n\n\n```unclosed', 'text/markdown', 700, 100);
    expect(result.stats.fallback === true || result.chunkCount >= 0).toBe(true);
  });

  it('handles UTF-8 Russian', () => {
    const result = svc.preview('ws', 'kb', 'Привет мир! Тест базы знаний.', 'text/plain', 700, 100);
    expect(result.tokenCount).toBeGreaterThan(0);
  });
});
