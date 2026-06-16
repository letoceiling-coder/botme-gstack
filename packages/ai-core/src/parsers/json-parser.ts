import { detectUtf8, normalizeExtractedText } from './normalize.js';
import type { DocumentParser, ParsedDocument } from './types.js';

type JsonRecord = Record<string, unknown>;

export class JsonParser implements DocumentParser {
  readonly mimeTypes = ['application/json'] as const;

  async parse(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    const raw = detectUtf8(buffer).trim();
    if (!raw) throw new Error('Пустой JSON файл');

    let data: unknown;
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      throw new Error('Некорректный JSON');
    }

    const { text, documentType, title } = jsonToKnowledgeText(data, filename);
    if (!text.trim()) throw new Error('JSON не содержит извлекаемого текста');

    return {
      text: normalizeExtractedText(text),
      metadata: {
        sourceFormat: 'application/json',
        title: title ?? filename,
        wordCount: text.split(/\s+/).length,
        documentType,
      },
    };
  }
}

export function jsonToKnowledgeText(
  data: unknown,
  fallbackTitle?: string,
): { text: string; documentType: 'faq' | 'general'; title?: string } {
  if (Array.isArray(data)) {
    const faq = formatJsonArray(data);
    const isFaq = data.every(isFaqItem);
    return {
      text: faq,
      documentType: isFaq ? 'faq' : 'general',
      title: fallbackTitle,
    };
  }

  if (data && typeof data === 'object') {
    const record = data as JsonRecord;
    const title = pickString(record, ['title', 'name', 'heading']) ?? fallbackTitle;
    if (Array.isArray(record['items']) || Array.isArray(record['faq']) || Array.isArray(record['entries'])) {
      const items = (record['items'] ?? record['faq'] ?? record['entries']) as unknown[];
      const faq = formatJsonArray(items);
      return { text: faq, documentType: 'faq', title };
    }
    return {
      text: flattenJsonObject(record),
      documentType: 'general',
      title,
    };
  }

  return {
    text: String(data),
    documentType: 'general',
    title: fallbackTitle,
  };
}

function isFaqItem(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const r = value as JsonRecord;
  return (
    (typeof r['question'] === 'string' || typeof r['q'] === 'string') &&
    (typeof r['answer'] === 'string' || typeof r['a'] === 'string' || typeof r['content'] === 'string')
  );
}

function formatJsonArray(items: unknown[]): string {
  const lines: string[] = [];
  for (const item of items) {
    if (isFaqItem(item)) {
      const r = item as JsonRecord;
      const q = pickString(r, ['question', 'q', 'title']) ?? 'Вопрос';
      const a = pickString(r, ['answer', 'a', 'content', 'text']) ?? '';
      lines.push(`## ${q}\n\n${a}`);
      continue;
    }
    if (item && typeof item === 'object') {
      const r = item as JsonRecord;
      const heading = pickString(r, ['title', 'name', 'heading', 'section', 'category']);
      const body =
        pickString(r, ['content', 'text', 'body', 'description']) ??
        flattenJsonObject(r, heading ? 0 : 0);
      if (heading) {
        lines.push(`## ${heading}\n\n${body}`);
      } else {
        lines.push(body);
      }
      continue;
    }
    if (item != null) {
      lines.push(String(item));
    }
  }
  return lines.join('\n\n');
}

function flattenJsonObject(obj: JsonRecord, depth = 0): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value == null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`**${key}:** ${String(value)}`);
      continue;
    }
    if (Array.isArray(value)) {
      lines.push(`## ${key}\n\n${formatJsonArray(value)}`);
      continue;
    }
    if (typeof value === 'object') {
      const nested = flattenJsonObject(value as JsonRecord, depth + 1);
      lines.push(depth === 0 ? `## ${key}\n\n${nested}` : `**${key}**\n${nested}`);
    }
  }
  return lines.join('\n\n');
}

function pickString(obj: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}
