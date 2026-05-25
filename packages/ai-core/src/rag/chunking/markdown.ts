import type { ChunkInput } from '../chunker.js';

const CODE_FENCE = /```[\s\S]*?```/g;
const TABLE_BLOCK = /(?:^\|.+\|\s*\n^\|[-:| ]+\|\s*\n(?:^\|.+\|\s*\n?)+)/gm;

export interface MarkdownBlock {
  kind: 'heading' | 'paragraph' | 'code' | 'table' | 'list';
  text: string;
  section?: string;
  level?: number;
}

export function extractProtectedBlocks(text: string): {
  sanitized: string;
  blocks: Map<string, string>;
} {
  const blocks = new Map<string, string>();
  let i = 0;
  let sanitized = text;

  sanitized = sanitized.replace(CODE_FENCE, (match) => {
    const key = `__BLOCK_${i++}__`;
    blocks.set(key, match);
    return key;
  });

  sanitized = sanitized.replace(TABLE_BLOCK, (match) => {
    const key = `__BLOCK_${i++}__`;
    blocks.set(key, match);
    return key;
  });

  return { sanitized, blocks };
}

export function restoreProtectedBlocks(text: string, blocks: Map<string, string>): string {
  let out = text;
  for (const [key, value] of blocks) {
    out = out.replace(key, value);
  }
  return out;
}

export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const { sanitized, blocks } = extractProtectedBlocks(text);
  const result: MarkdownBlock[] = [];
  let currentSection = '';
  let currentLevel = 0;
  let buffer: string[] = [];

  const flush = (kind: MarkdownBlock['kind'] = 'paragraph') => {
    const joined = restoreProtectedBlocks(buffer.join('\n').trim(), blocks);
    if (!joined) {
      buffer = [];
      return;
    }
    if (joined.startsWith('__BLOCK_') && blocks.has(joined)) {
      const original = blocks.get(joined)!;
      result.push({
        kind: original.startsWith('```') ? 'code' : 'table',
        text: original.trim(),
        section: currentSection || undefined,
        level: currentLevel,
      });
    } else {
      result.push({
        kind,
        text: joined,
        section: currentSection || undefined,
        level: currentLevel,
      });
    }
    buffer = [];
  };

  for (const line of sanitized.split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flush();
      currentLevel = heading[1]?.length ?? 1;
      currentSection = heading[2]?.trim() ?? '';
      result.push({
        kind: 'heading',
        text: line.trim(),
        section: currentSection,
        level: currentLevel,
      });
      continue;
    }

    if (line.startsWith('__BLOCK_') && blocks.has(line.trim())) {
      flush();
      const original = blocks.get(line.trim())!;
      result.push({
        kind: original.startsWith('```') ? 'code' : 'table',
        text: original.trim(),
        section: currentSection || undefined,
        level: currentLevel,
      });
      continue;
    }

    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      buffer.push(line);
      continue;
    }

    if (line.trim() === '' && buffer.length > 0) {
      flush(/^[-*\d]/.test(buffer[0] ?? '') ? 'list' : 'paragraph');
      continue;
    }

    buffer.push(line);
  }
  flush();

  return result.filter((b) => b.text.length > 0);
}

export function markdownBlocksToSegments(blocks: MarkdownBlock[]): ChunkInput[] {
  return blocks
    .filter((b) => b.kind !== 'heading')
    .map((b) => ({
      text: b.kind === 'heading' ? b.text : b.text,
      sourceSection: b.section,
    }));
}
