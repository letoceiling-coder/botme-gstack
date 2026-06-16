import type { KbDocumentDto, KnowledgeBaseDto } from '@botme/shared';
import { Badge } from '@botme/ui';

const STATUS_RU: Record<string, string> = {
  PENDING: 'Ожидание',
  UPLOADED: 'Загружен',
  QUEUED: 'В очереди',
  PARSING: 'Парсинг',
  CHUNKING: 'Chunking',
  EMBEDDING: 'Embedding',
  INDEXED: 'Индексирован',
  FAILED: 'Ошибка',
  RETRYING: 'Повтор',
  DELETED: 'Удалён',
};

export function docStatusBadge(status: string) {
  if (status === 'INDEXED') return <Badge variant="success">{STATUS_RU[status] ?? status}</Badge>;
  if (status === 'FAILED') return <Badge variant="warning">{STATUS_RU[status] ?? status}</Badge>;
  if (['PARSING', 'CHUNKING', 'EMBEDDING', 'QUEUED', 'RETRYING'].includes(status)) {
    return <Badge variant="muted">{STATUS_RU[status] ?? status}</Badge>;
  }
  return <Badge variant="muted">{STATUS_RU[status] ?? status}</Badge>;
}

export function sourceBadge(sourceType: string) {
  const labels: Record<string, string> = { TEXT: 'Текст', FILE: 'Файл', URL: 'URL' };
  return <Badge variant="muted">{labels[sourceType] ?? sourceType}</Badge>;
}

export function isIndexing(status: string): boolean {
  return ['PARSING', 'CHUNKING', 'EMBEDDING', 'QUEUED', 'RETRYING', 'UPLOADED'].includes(status);
}

export function filterDocuments(
  docs: KbDocumentDto[],
  search: string,
  statusFilter: string,
): KbDocumentDto[] {
  const q = search.trim().toLowerCase();
  return docs.filter((d) => {
    if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
    if (!q) return true;
    return (
      d.title.toLowerCase().includes(q) ||
      d.filename.toLowerCase().includes(q) ||
      (d.sourceUrl?.toLowerCase().includes(q) ?? false)
    );
  });
}

export function filterKbs(kbs: KnowledgeBaseDto[], search: string): KnowledgeBaseDto[] {
  const q = search.trim().toLowerCase();
  if (!q) return kbs;
  return kbs.filter((k) => k.name.toLowerCase().includes(q));
}

/** User-facing hint for ingestion errors (text may still be visible in editor). */
export function formatDocErrorMessage(message: string | null | undefined): string | null {
  if (!message?.trim()) return null;
  const lower = message.toLowerCase();
  if (lower.includes('integration not found')) {
    return 'Не удалось построить embeddings — проверьте AI-интеграцию OpenRouter и нажмите «Повтор»';
  }
  if (lower.includes('root openrouter')) {
    return 'Нет активной OpenRouter-интеграции для embeddings';
  }
  if (lower.includes('contenthash') || lower.includes('unique constraint')) {
    return 'Ошибка нарезки документа — нажмите «Повтор»';
  }
  if (lower.includes('документ с таким содержимым')) {
    return 'Этот файл уже загружен в базу знаний';
  }
  return message;
}

export const UPLOAD_MIME: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  html: 'text/html',
  htm: 'text/html',
  json: 'application/json',
};

export type WorkspaceTab = 'documents' | 'editor' | 'chunks' | 'retrieval' | 'settings';
