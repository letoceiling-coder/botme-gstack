import { describe, expect, it } from 'vitest';
import { smartChunk, extractFaqPairs, parseMarkdownBlocks } from './index.js';

describe('smartChunk', () => {
  it('preserves FAQ pairs as single chunks', () => {
    const text = `Q: What is Botme?
A: Botme is an AI assistant platform.

Q: How to embed?
A: Add widget.js to your site.`;
    const pairs = extractFaqPairs(text);
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    const chunks = smartChunk(text, 'text/plain', { documentType: 'faq' });
    expect(chunks.every((c) => c.metadata.isFaqPair)).toBe(true);
  });

  it('keeps code blocks intact in markdown', () => {
    const md = `# API\n\n\`\`\`ts\nconst x = 1;\nconsole.log(x);\n\`\`\``;
    const blocks = parseMarkdownBlocks(md);
    expect(blocks.some((b) => b.kind === 'code')).toBe(true);
    const chunks = smartChunk(md, 'text/markdown');
    expect(chunks.some((c) => c.content.includes('const x = 1'))).toBe(true);
  });

  it('respects markdown headings as sections', () => {
    const md = '# Intro\n\nFirst paragraph.\n\n## Details\n\nSecond paragraph with content.';
    const chunks = smartChunk(md, 'text/markdown');
    expect(chunks.some((c) => c.metadata.sectionTitle === 'Intro' || c.sourceSection === 'Intro')).toBe(true);
  });
});
