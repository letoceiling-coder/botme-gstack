import type { CrawlPageResult } from '../jobs/kb-crawl.js';
import type { NeekloParserPage, NeekloParserUrlsResult } from './neeklo-parser.client.js';

export function parserUrlsResultToCrawlPages(result: NeekloParserUrlsResult): CrawlPageResult[] {
  const pages: CrawlPageResult[] = [];

  for (const page of result.pages ?? []) {
    const text = pageTextFromParserPage(page);
    if (!text.trim()) continue;
    pages.push({
      url: page.finalUrl ?? page.url,
      title: page.title ?? page.data?.title ?? page.url,
      text,
    });
  }

  if (pages.length === 0 && result.answer?.trim()) {
    const url = result.urls[0] ?? 'summary';
    pages.push({ url, title: 'Сводка', text: result.answer.trim() });
  }

  return pages;
}

export function pageTextFromParserPage(page: NeekloParserPage): string {
  if (!page.ok) {
    return page.error ? `[${page.url}] ${page.error}` : '';
  }

  const parts: string[] = [];
  const data = page.data;

  if (data?.summary?.trim()) parts.push(data.summary.trim());
  if (data?.services?.length) {
    parts.push(`## Услуги\n${data.services.map((s) => `- ${s}`).join('\n')}`);
  }
  if (data?.prices?.length) {
    const lines = data.prices.map((p) => {
      const label = p.name ?? 'Позиция';
      const price = p.price ?? (p.from != null ? `от ${p.from}` : '');
      return `- ${label}: ${price}`.trim();
    });
    parts.push(`## Цены\n${lines.join('\n')}`);
  }
  if (data?.contacts && Object.keys(data.contacts).length > 0) {
    const lines = Object.entries(data.contacts)
      .filter(([, v]) => typeof v === 'string' && v.trim())
      .map(([k, v]) => `- ${contactLabel(k)}: ${v}`);
    if (lines.length > 0) parts.push(`## Контакты\n${lines.join('\n')}`);
  }
  if (data?.sections?.length) {
    for (const section of data.sections) {
      if (!section.content?.trim()) continue;
      const heading = section.heading?.trim();
      parts.push(heading ? `## ${heading}\n\n${section.content.trim()}` : section.content.trim());
    }
  }

  if (parts.length === 0 && page.textPreview?.trim()) {
    return page.textPreview.trim();
  }
  if (parts.length === 0 && data) {
    return structuredDataFallback(data);
  }
  return parts.join('\n\n');
}

function contactLabel(key: string): string {
  const map: Record<string, string> = {
    phone: 'Телефон',
    email: 'Email',
    address: 'Адрес',
    hours: 'Часы работы',
  };
  return map[key] ?? key;
}

function structuredDataFallback(data: Record<string, unknown>): string {
  const skip = new Set(['title', 'summary', 'contacts', 'prices', 'services', 'sections']);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (skip.has(key) || value == null) continue;
    if (typeof value === 'string') lines.push(`**${key}:** ${value}`);
    else if (typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`**${key}:** ${String(value)}`);
    }
  }
  return lines.join('\n');
}
