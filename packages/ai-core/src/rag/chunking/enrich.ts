import type { DocumentKind, DocumentMetadata } from './types.js';
import { extractFaqPairs, isLikelyFaqDocument } from './faq.js';
import { parseMarkdownBlocks } from './markdown.js';

const TOPIC_STOPWORDS = new Set([
  'the', 'and', 'for', 'this', 'that', 'with', 'from', 'как', 'что', 'для', 'это', 'или',
]);

export function detectDocumentKind(mimeType: string, text: string): DocumentKind {
  if (mimeType.includes('html')) return 'html';
  if (mimeType.includes('markdown') || mimeType === 'text/markdown') return 'markdown';
  if (isLikelyFaqDocument(text)) return 'faq';
  if (mimeType === 'text/plain') return 'text';
  return 'general';
}

export function extractDocumentMetadata(
  text: string,
  mimeType: string,
  title?: string,
): DocumentMetadata {
  const documentType = detectDocumentKind(mimeType, text);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const firstHeading = lines.find((l) => /^#{1,3}\s+/.test(l));
  const inferredTitle = title ?? firstHeading?.replace(/^#+\s+/, '') ?? lines[0]?.slice(0, 120);

  const tags = extractTags(text, documentType);
  const topic = extractTopic(text, inferredTitle);
  const sections =
    mimeType.includes('markdown') || documentType === 'markdown'
      ? parseMarkdownBlocks(text)
          .filter((b) => b.kind === 'heading')
          .map((b, i) => ({
            title: b.text.replace(/^#+\s+/, ''),
            level: b.level ?? 1,
            startOffset: i,
          }))
      : [];

  return {
    title: inferredTitle,
    documentType,
    language: detectLanguage(text),
    tags,
    topic,
    category: inferCategory(documentType, text),
    summary: lines.slice(0, 3).join(' ').slice(0, 280),
    retrievalPriority: documentType === 'faq' ? 1.2 : 1.0,
    sections,
  };
}

function detectLanguage(text: string): string {
  const cyrillic = (text.match(/[а-яА-ЯёЁ]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  if (cyrillic > latin * 0.3) return 'ru';
  if (latin > 0) return 'en';
  return 'ru';
}

function extractTags(text: string, documentType: DocumentKind): string[] {
  const tags = new Set<string>([documentType]);
  if (isLikelyFaqDocument(text)) tags.add('faq');
  const hashtags = [...text.matchAll(/#([\wа-яА-ЯёЁ-]{2,40})/gu)].map((m) => m[1]!.toLowerCase());
  hashtags.slice(0, 8).forEach((t) => tags.add(t));
  return [...tags].slice(0, 12);
}

function extractTopic(text: string, title?: string): string | undefined {
  const source = (title ?? text.slice(0, 500)).toLowerCase();
  const words = source
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !TOPIC_STOPWORDS.has(w));
  return words.slice(0, 3).join(' ') || undefined;
}

function inferCategory(documentType: DocumentKind, text: string): string {
  if (documentType === 'faq') return 'faq';
  const lower = text.toLowerCase();
  if (/политик|privacy|legal|terms|оферт/.test(lower)) return 'legal';
  if (/support|поддержк|help desk/.test(lower)) return 'support';
  if (/crm|лид|клиент/.test(lower)) return 'crm';
  return documentType === 'markdown' ? 'docs' : 'general';
}

export function enrichFaqMetadata(question: string, answer: string) {
  return {
    isFaqPair: true,
    topic: question.replace(/\?+$/, '').trim(),
    retrievalHint: question,
    tags: ['faq'],
    sectionTitle: question,
  };
}

export { extractFaqPairs };
