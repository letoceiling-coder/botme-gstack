import { RAG_SYSTEM_SUFFIX, wrapRetrievedContext } from './prompt-defense.js';
import { buildRagContextBlock } from './context-budget.js';

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  filename: string;
  content: string;
  score: number;
  sourcePage?: number | null;
  sourceSection?: string | null;
}

export interface RagAssemblyResult {
  systemPrompt: string;
  citations: Array<{
    chunkId: string;
    documentId: string;
    filename: string;
    page?: number | null;
    section?: string | null;
    score: number;
    label: string;
  }>;
}

export function formatCitationLabel(filename: string, page?: number | null, section?: string | null): string {
  if (page != null) return `${filename} p.${page}`;
  if (section) return `${filename} §${section}`;
  return filename;
}

export function assembleRagPrompt(
  baseSystemPrompt: string,
  retrieved: RetrievedChunk[],
  retrievalTokenBudget = 2000,
): RagAssemblyResult {
  if (retrieved.length === 0) {
    return { systemPrompt: baseSystemPrompt, citations: [] };
  }

  const citations = retrieved.map((r) => {
    const label = formatCitationLabel(r.filename, r.sourcePage, r.sourceSection);
    return {
      chunkId: r.chunkId,
      documentId: r.documentId,
      filename: r.filename,
      page: r.sourcePage,
      section: r.sourceSection,
      score: r.score,
      label,
    };
  });

  const contextBlock = buildRagContextBlock(
    retrieved.map((r, i) => ({
      citation: citations[i]!.label,
      content: r.content,
    })),
    retrievalTokenBudget,
  );

  const systemPrompt = [
    baseSystemPrompt,
    '',
    '--- Retrieved knowledge (reference only) ---',
    contextBlock,
    '',
    RAG_SYSTEM_SUFFIX,
  ].join('\n');

  return { systemPrompt, citations };
}

export { wrapRetrievedContext };
