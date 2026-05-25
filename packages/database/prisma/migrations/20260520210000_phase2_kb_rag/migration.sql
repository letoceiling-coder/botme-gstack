-- Phase 2: KB documents, chunks, pgvector embeddings

CREATE TYPE "KbDocumentStatus" AS ENUM (
  'PENDING', 'UPLOADED', 'PARSING', 'CHUNKING', 'EMBEDDING', 'INDEXED', 'FAILED', 'DELETED'
);

ALTER TABLE "knowledge_bases" ADD COLUMN "embeddingIntegrationId" TEXT;
ALTER TABLE "knowledge_bases" ADD COLUMN "embeddingModelId" TEXT NOT NULL DEFAULT 'text-embedding-3-small';
ALTER TABLE "knowledge_bases" ADD COLUMN "documentCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "knowledge_bases" ADD COLUMN "chunkCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "knowledge_bases" ADD COLUMN "tokenCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_embeddingIntegrationId_fkey"
  FOREIGN KEY ("embeddingIntegrationId") REFERENCES "ai_integrations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "messages" ADD COLUMN "citations" JSONB;

CREATE TABLE "kb_documents" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "knowledgeBaseId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileHash" TEXT NOT NULL,
  "status" "KbDocumentStatus" NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "chunkCount" INTEGER NOT NULL DEFAULT 0,
  "tokenCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "kb_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kb_chunks" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "knowledgeBaseId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "tokenCount" INTEGER NOT NULL,
  "sourcePage" INTEGER,
  "sourceSection" TEXT,
  "startOffset" INTEGER NOT NULL,
  "endOffset" INTEGER NOT NULL,
  "contentHash" TEXT NOT NULL,
  "embedding" vector(1536),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kb_chunks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kb_documents_knowledgeBaseId_fileHash_key"
  ON "kb_documents"("knowledgeBaseId", "fileHash");
CREATE INDEX "kb_documents_workspaceId_knowledgeBaseId_deletedAt_idx"
  ON "kb_documents"("workspaceId", "knowledgeBaseId", "deletedAt");
CREATE INDEX "kb_documents_knowledgeBaseId_status_idx"
  ON "kb_documents"("knowledgeBaseId", "status");

CREATE UNIQUE INDEX "kb_chunks_documentId_chunkIndex_key" ON "kb_chunks"("documentId", "chunkIndex");
CREATE UNIQUE INDEX "kb_chunks_documentId_contentHash_key" ON "kb_chunks"("documentId", "contentHash");
CREATE INDEX "kb_chunks_workspaceId_knowledgeBaseId_idx" ON "kb_chunks"("workspaceId", "knowledgeBaseId");

ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_knowledgeBaseId_fkey"
  FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_knowledgeBaseId_fkey"
  FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "kb_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "kb_chunks_embedding_idx" ON "kb_chunks"
  USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
