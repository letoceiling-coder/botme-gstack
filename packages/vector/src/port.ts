export interface VectorSearchResult {
  chunkId: string;
  score: number;
  content: string;
  metadata: Record<string, string | number | boolean>;
}

export interface VectorStorePort {
  upsert(
    workspaceId: string,
    kbId: string,
    items: Array<{ id: string; embedding: number[]; content: string; metadata: Record<string, unknown> }>,
  ): Promise<void>;

  search(
    workspaceId: string,
    kbIds: string[],
    embedding: number[],
    limit: number,
  ): Promise<VectorSearchResult[]>;

  deleteByDocument(workspaceId: string, documentId: string): Promise<void>;
}

export class PgVectorStoreNotConfiguredError extends Error {
  constructor() {
    super('PgVectorStore будет подключён в Phase 2 (Knowledge Base)');
    this.name = 'PgVectorStoreNotConfiguredError';
  }
}
