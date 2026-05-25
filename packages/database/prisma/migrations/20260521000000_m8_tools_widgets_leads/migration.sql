-- CreateEnum
CREATE TYPE "ToolExecutionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT');
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED', 'SPAM');
CREATE TYPE "LeadSource" AS ENUM ('WIDGET', 'TEST_CHAT', 'API', 'MANUAL');

-- AlterEnum
ALTER TYPE "ToolType" ADD VALUE IF NOT EXISTS 'MEMORY';
ALTER TYPE "ToolType" ADD VALUE IF NOT EXISTS 'WEBHOOK';
ALTER TYPE "ToolType" ADD VALUE IF NOT EXISTS 'WEB_SEARCH';
ALTER TYPE "ToolType" ADD VALUE IF NOT EXISTS 'EMAIL_STUB';
ALTER TYPE "ToolType" ADD VALUE IF NOT EXISTS 'CRM_NOTE';

-- AlterTable tools
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "schema" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "permissions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "timeoutMs" INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "retryPolicy" JSONB NOT NULL DEFAULT '{"maxRetries":0,"backoffMs":0}';

UPDATE "tools" SET "slug" = LOWER(REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g'))
WHERE "slug" IS NULL;

ALTER TABLE "tools" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "tools_workspaceId_slug_key" ON "tools"("workspaceId", "slug");
CREATE INDEX IF NOT EXISTS "tools_workspaceId_type_idx" ON "tools"("workspaceId", "type");

-- CreateTable tool_executions
CREATE TABLE IF NOT EXISTS "tool_executions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "assistantId" TEXT,
    "conversationId" TEXT,
    "status" "ToolExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "error" TEXT,
    "latencyMs" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tool_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "leads" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "assistantId" TEXT,
    "conversationId" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "source" "LeadSource" NOT NULL DEFAULT 'WIDGET',
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "visitor_memories" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "visitor_memories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "crm_notes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "assistantId" TEXT,
    "conversationId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_notes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "assistants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leads" ADD CONSTRAINT "leads_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "assistants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "visitor_memories" ADD CONSTRAINT "visitor_memories_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "assistants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "tool_executions_workspaceId_toolId_createdAt_idx" ON "tool_executions"("workspaceId", "toolId", "createdAt");
CREATE INDEX IF NOT EXISTS "tool_executions_workspaceId_createdAt_idx" ON "tool_executions"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "tool_executions_conversationId_idx" ON "tool_executions"("conversationId");

CREATE INDEX IF NOT EXISTS "leads_workspaceId_status_createdAt_idx" ON "leads"("workspaceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "leads_workspaceId_createdAt_idx" ON "leads"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "leads_conversationId_idx" ON "leads"("conversationId");

CREATE UNIQUE INDEX IF NOT EXISTS "visitor_memories_workspaceId_visitorId_key_key" ON "visitor_memories"("workspaceId", "visitorId", "key");
CREATE INDEX IF NOT EXISTS "visitor_memories_workspaceId_visitorId_idx" ON "visitor_memories"("workspaceId", "visitorId");

CREATE INDEX IF NOT EXISTS "crm_notes_workspaceId_createdAt_idx" ON "crm_notes"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "crm_notes_conversationId_idx" ON "crm_notes"("conversationId");
