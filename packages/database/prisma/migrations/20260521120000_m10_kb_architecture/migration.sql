-- M10: KB architecture — metadata, hierarchy, partial fileHash unique, retrieval settings

-- Fix fileHash unique: allow re-upload after soft-delete or failed ingest
ALTER TABLE "kb_documents" DROP CONSTRAINT IF EXISTS "kb_documents_knowledgeBaseId_fileHash_key";

CREATE UNIQUE INDEX IF NOT EXISTS "kb_documents_active_hash_unique"
  ON "kb_documents"("knowledgeBaseId", "fileHash")
  WHERE "deletedAt" IS NULL AND status NOT IN ('FAILED', 'DELETED');

-- Document taxonomy
ALTER TABLE "kb_documents"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'ru',
  ADD COLUMN IF NOT EXISTS "documentType" TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS "retrievalPriority" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- Chunk hierarchy + metadata
ALTER TABLE "kb_chunks"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "parentChunkId" TEXT,
  ADD COLUMN IF NOT EXISTS "hierarchyLevel" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "topic" TEXT,
  ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "retrievalPriority" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- KB retrieval / chunking settings
ALTER TABLE "knowledge_bases"
  ADD COLUMN IF NOT EXISTS "chunkStrategy" TEXT NOT NULL DEFAULT 'smart',
  ADD COLUMN IF NOT EXISTS "hybridRetrievalEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "metadataExtractionEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "aiEnrichmentEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "semanticMode" TEXT NOT NULL DEFAULT 'hybrid';

CREATE INDEX IF NOT EXISTS "kb_chunks_parentChunkId_idx" ON "kb_chunks"("parentChunkId");
CREATE INDEX IF NOT EXISTS "kb_documents_tags_idx" ON "kb_documents" USING GIN("tags");
CREATE INDEX IF NOT EXISTS "kb_chunks_tags_idx" ON "kb_chunks" USING GIN("tags");
CREATE INDEX IF NOT EXISTS "kb_documents_metadata_idx" ON "kb_documents" USING GIN("metadata");
CREATE INDEX IF NOT EXISTS "kb_chunks_metadata_idx" ON "kb_chunks" USING GIN("metadata");

-- Tombstone orphaned soft-deleted docs that block active hash slots
UPDATE "kb_documents"
SET "fileHash" = 'tombstone:' || "id" || ':' || "fileHash"
WHERE "deletedAt" IS NOT NULL AND "fileHash" NOT LIKE 'tombstone:%';

UPDATE "kb_documents"
SET "fileHash" = 'failed:' || "id" || ':' || "fileHash"
WHERE status = 'FAILED' AND "deletedAt" IS NULL AND "fileHash" NOT LIKE 'failed:%' AND "fileHash" NOT LIKE 'tombstone:%';
