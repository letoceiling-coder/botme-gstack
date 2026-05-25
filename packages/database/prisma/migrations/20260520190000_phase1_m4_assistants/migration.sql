-- M4: Assistants expansion, KB/Tool stubs, bindings, runtime snapshots

CREATE TYPE "AssistantVisibility" AS ENUM ('PUBLIC', 'INTERNAL', 'PRIVATE');
CREATE TYPE "KnowledgeBaseStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "ToolStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "ToolType" AS ENUM ('CALCULATOR', 'HTTP_REQUEST', 'LEAD_SAVER', 'RAG_SEARCH', 'CUSTOM');

ALTER TABLE "assistants" ADD COLUMN "slug" TEXT;
ALTER TABLE "assistants" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "assistants" ADD COLUMN "placeholder" TEXT NOT NULL DEFAULT '';
ALTER TABLE "assistants" ADD COLUMN "tone" TEXT NOT NULL DEFAULT 'neutral';
ALTER TABLE "assistants" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'ru';
ALTER TABLE "assistants" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "assistants" ADD COLUMN "visibility" "AssistantVisibility" NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "assistants" ADD COLUMN "createdBy" TEXT;

UPDATE "assistants" SET "slug" = 'assistant-' || substr(id, 1, 8) WHERE "slug" IS NULL;
UPDATE "assistants" a SET "createdBy" = (
  SELECT wm."userId" FROM "workspace_members" wm
  WHERE wm."workspaceId" = a."workspaceId"
  ORDER BY CASE wm."role" WHEN 'OWNER' THEN 1 WHEN 'ADMIN' THEN 2 ELSE 3 END
  LIMIT 1
) WHERE "createdBy" IS NULL;

UPDATE "assistants" a SET "createdBy" = (
  SELECT u."id" FROM "users" u LIMIT 1
) WHERE "createdBy" IS NULL;

ALTER TABLE "assistants" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "assistants" ALTER COLUMN "createdBy" SET NOT NULL;

CREATE UNIQUE INDEX "assistants_workspaceId_slug_key" ON "assistants"("workspaceId", "slug");
CREATE INDEX "assistants_workspaceId_isActive_idx" ON "assistants"("workspaceId", "isActive");

ALTER TABLE "assistants" ADD CONSTRAINT "assistants_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assistant_runtime_settings" ADD COLUMN "maxContextMessages" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "assistant_runtime_settings" ADD COLUMN "memoryEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "assistant_runtime_settings" ADD COLUMN "citationsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "assistant_runtime_settings" ADD COLUMN "moderationEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "assistant_runtime_settings" ADD COLUMN "fallbackMessage" TEXT NOT NULL DEFAULT 'Извините, я не могу ответить сейчас.';
ALTER TABLE "assistant_runtime_settings" ADD COLUMN "typingSimulation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "assistant_runtime_settings" ADD COLUMN "streamingEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "assistant_runtime_settings" DROP COLUMN IF EXISTS "typingIndicator";

CREATE TABLE "knowledge_bases" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "KnowledgeBaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tools" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" "ToolType" NOT NULL DEFAULT 'CUSTOM',
    "status" "ToolStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "tools_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assistant_knowledge_bases" (
    "assistantId" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assistant_knowledge_bases_pkey" PRIMARY KEY ("assistantId","knowledgeBaseId")
);

CREATE TABLE "assistant_tools" (
    "assistantId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assistant_tools_pkey" PRIMARY KEY ("assistantId","toolId")
);

CREATE TABLE "assistant_runtime_snapshots" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assistant_runtime_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_bases_workspaceId_name_key" ON "knowledge_bases"("workspaceId", "name");
CREATE INDEX "knowledge_bases_workspaceId_deletedAt_idx" ON "knowledge_bases"("workspaceId", "deletedAt");
CREATE UNIQUE INDEX "tools_workspaceId_name_key" ON "tools"("workspaceId", "name");
CREATE INDEX "tools_workspaceId_deletedAt_idx" ON "tools"("workspaceId", "deletedAt");
CREATE INDEX "assistant_runtime_snapshots_assistantId_createdAt_idx" ON "assistant_runtime_snapshots"("assistantId", "createdAt");

ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tools" ADD CONSTRAINT "tools_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistant_knowledge_bases" ADD CONSTRAINT "assistant_knowledge_bases_assistantId_fkey"
  FOREIGN KEY ("assistantId") REFERENCES "assistants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistant_knowledge_bases" ADD CONSTRAINT "assistant_knowledge_bases_knowledgeBaseId_fkey"
  FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistant_tools" ADD CONSTRAINT "assistant_tools_assistantId_fkey"
  FOREIGN KEY ("assistantId") REFERENCES "assistants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistant_tools" ADD CONSTRAINT "assistant_tools_toolId_fkey"
  FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistant_runtime_snapshots" ADD CONSTRAINT "assistant_runtime_snapshots_assistantId_fkey"
  FOREIGN KEY ("assistantId") REFERENCES "assistants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
