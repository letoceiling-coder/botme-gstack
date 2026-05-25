/** KB embedding model tiers — free/low-cost first, automatic fallback. */
export const KB_EMBEDDING_MODEL_TIERS = [
  'text-embedding-3-small',
  'openai/text-embedding-3-small',
  'qwen/qwen3-embedding-4b:free',
  'google/gemini-embedding-001',
] as const;

export const KB_ROOT_INTEGRATION_NAME = 'root';

export function isRetryableProviderError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    /rate.?limit|429|503|502|504|timeout|overloaded|unavailable|capacity|too many/i.test(msg)
  );
}

export interface EmbeddingAttemptResult {
  modelId: string;
  embeddings: number[][];
}

export interface AiEmbeddingsPort {
  embeddings(params: { model: string; input: string[] }): Promise<{ embeddings: number[][] }>;
}

export async function embedWithModelFallback(
  adapter: AiEmbeddingsPort,
  input: string[],
  tiers: readonly string[] = KB_EMBEDDING_MODEL_TIERS,
): Promise<EmbeddingAttemptResult> {
  let lastError: unknown;
  for (const modelId of tiers) {
    try {
      const result = await adapter.embeddings({ model: modelId, input });
      if (result.embeddings.length > 0) {
        return { modelId, embeddings: result.embeddings };
      }
    } catch (err) {
      lastError = err;
      if (!isRetryableProviderError(err)) throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All embedding models failed');
}

export function enrichChunkMetadata(meta: Record<string, unknown>, sectionPath?: string[]) {
  return {
    ...meta,
    sectionPath: sectionPath ?? meta['sectionPath'] ?? [],
    semanticType: meta['semanticType'] ?? inferSemanticType(meta),
    importance: meta['importance'] ?? 1,
  };
}

function inferSemanticType(meta: Record<string, unknown>): string {
  if (meta['isFaqPair']) return 'faq';
  if (meta['isCodeBlock']) return 'code';
  if (meta['isTable']) return 'table';
  if (meta['sectionTitle']) return 'section';
  return 'paragraph';
}
