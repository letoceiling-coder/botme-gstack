import { detectUtf8, normalizeExtractedText } from './normalize.js';
import type { DocumentParser, ParsedDocument } from './types.js';

export class PlainTextParser implements DocumentParser {
  readonly mimeTypes = ['text/plain'] as const;

  async parse(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    const text = normalizeExtractedText(detectUtf8(buffer));
    if (!text) throw new Error('Пустой текстовый файл');
    return {
      text,
      metadata: { sourceFormat: 'text/plain', title: filename, wordCount: text.split(/\s+/).length },
    };
  }
}

export class MarkdownParser implements DocumentParser {
  readonly mimeTypes = ['text/markdown'] as const;

  async parse(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    const text = normalizeExtractedText(detectUtf8(buffer));
    if (!text) throw new Error('Пустой markdown файл');
    return {
      text,
      metadata: { sourceFormat: 'text/markdown', title: filename, wordCount: text.split(/\s+/).length },
    };
  }
}

export class HtmlParser implements DocumentParser {
  readonly mimeTypes = ['text/html'] as const;

  async parse(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    const raw = detectUtf8(buffer);
    const text = normalizeExtractedText(stripHtml(raw));
    if (!text) throw new Error('HTML не содержит извлекаемого текста');
    const titleMatch = raw.match(/<title[^>]*>([^<]*)<\/title>/i);
    return {
      text,
      metadata: {
        sourceFormat: 'text/html',
        title: titleMatch?.[1]?.trim() || filename,
        wordCount: text.split(/\s+/).length,
      },
    };
  }
}

export class CsvParser implements DocumentParser {
  readonly mimeTypes = ['text/csv'] as const;

  async parse(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    const raw = detectUtf8(buffer);
    const lines = raw.split('\n').filter((l) => l.trim());
    if (lines.length === 0) throw new Error('CSV пуст');

    const rows = lines.map((line) => parseCsvLine(line));
    const text = rows
      .map((row, i) => (i === 0 ? `Заголовки: ${row.join(' | ')}` : row.join(' | ')))
      .join('\n');

    return {
      text: normalizeExtractedText(text),
      metadata: { sourceFormat: 'text/csv', title: filename, wordCount: text.split(/\s+/).length },
    };
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
}
