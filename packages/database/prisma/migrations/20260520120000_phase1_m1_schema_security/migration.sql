-- CreateEnum
CREATE TYPE "AiProviderType" AS ENUM ('OPENAI', 'OPENROUTER', 'ANTHROPIC', 'GEMINI', 'OLLAMA', 'GROQ', 'DEEPSEEK', 'TOGETHER', 'MISTRAL');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'INVALID', 'DISABLED', 'PENDING_VALIDATION');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssistantStatus" AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlaygroundMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateTable
CREATE TABLE "ai_integrations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "AiProviderType" NOT NULL,
    "name" TEXT NOT NULL,
    "encryptedSecret" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'PENDING_VALIDATION',
    "lastValidatedAt" TIMESTAMP(3),
    "health" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ai_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_cache" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "provider" "AiProviderType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "contextWindow" INTEGER NOT NULL,
    "promptPrice" DECIMAL(18,8),
    "completionPrice" DECIMAL(18,8),
    "supportsTools" BOOLEAN NOT NULL DEFAULT false,
    "supportsVision" BOOLEAN NOT NULL DEFAULT false,
    "supportsReasoning" BOOLEAN NOT NULL DEFAULT false,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_model_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "topP" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "maxTokens" INTEGER NOT NULL DEFAULT 4096,
    "systemPrompt" TEXT NOT NULL,
    "safetySettings" JSONB NOT NULL DEFAULT '{}',
    "streamingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "toolsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "embeddingsModel" TEXT,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "activePromptVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_prompt_versions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistants" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "welcomeMessage" TEXT NOT NULL DEFAULT '',
    "behavior" JSONB NOT NULL DEFAULT '{}',
    "escalation" JSONB,
    "leadCapture" JSONB,
    "status" "AssistantStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "assistants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_runtime_settings" (
    "assistantId" TEXT NOT NULL,
    "theme" JSONB NOT NULL DEFAULT '{}',
    "widgetPosition" TEXT NOT NULL DEFAULT 'bottom-right',
    "language" TEXT NOT NULL DEFAULT 'ru',
    "typingIndicator" BOOLEAN NOT NULL DEFAULT true,
    "offlineMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_runtime_settings_pkey" PRIMARY KEY ("assistantId")
);

-- CreateTable
CREATE TABLE "widget_instances" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "launcherConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "widget_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "widget_domains" (
    "id" TEXT NOT NULL,
    "widgetId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "widget_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "widgetId" TEXT,
    "visitorId" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tokenUsage" JSONB,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playground_sessions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "playground_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_integrations_workspaceId_provider_name_key" ON "ai_integrations"("workspaceId", "provider", "name");

-- CreateIndex
CREATE INDEX "ai_integrations_workspaceId_deletedAt_idx" ON "ai_integrations"("workspaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "ai_integrations_workspaceId_status_idx" ON "ai_integrations"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_cache_integrationId_externalId_key" ON "ai_model_cache"("integrationId", "externalId");

-- CreateIndex
CREATE INDEX "ai_model_cache_integrationId_isFree_idx" ON "ai_model_cache"("integrationId", "isFree");

-- CreateIndex
CREATE UNIQUE INDEX "agents_activePromptVersionId_key" ON "agents"("activePromptVersionId");

-- CreateIndex
CREATE INDEX "agents_workspaceId_deletedAt_idx" ON "agents"("workspaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "agents_workspaceId_status_idx" ON "agents"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "agents_integrationId_idx" ON "agents"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_prompt_versions_agentId_version_key" ON "agent_prompt_versions"("agentId", "version");

-- CreateIndex
CREATE INDEX "agent_prompt_versions_agentId_createdAt_idx" ON "agent_prompt_versions"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "assistants_workspaceId_deletedAt_idx" ON "assistants"("workspaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "assistants_workspaceId_status_idx" ON "assistants"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "assistants_agentId_idx" ON "assistants"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "widget_instances_publicKey_key" ON "widget_instances"("publicKey");

-- CreateIndex
CREATE INDEX "widget_instances_workspaceId_deletedAt_idx" ON "widget_instances"("workspaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "widget_instances_assistantId_idx" ON "widget_instances"("assistantId");

-- CreateIndex
CREATE UNIQUE INDEX "widget_domains_widgetId_domain_key" ON "widget_domains"("widgetId", "domain");

-- CreateIndex
CREATE INDEX "widget_domains_domain_idx" ON "widget_domains"("domain");

-- CreateIndex
CREATE INDEX "conversations_workspaceId_assistantId_idx" ON "conversations"("workspaceId", "assistantId");

-- CreateIndex
CREATE INDEX "conversations_workspaceId_widgetId_idx" ON "conversations"("workspaceId", "widgetId");

-- CreateIndex
CREATE INDEX "conversations_visitorId_idx" ON "conversations"("visitorId");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_workspaceId_createdAt_idx" ON "messages"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_workspaceId_createdAt_idx" ON "audit_logs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_workspaceId_resource_resourceId_idx" ON "audit_logs"("workspaceId", "resource", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "playground_sessions_workspaceId_deletedAt_idx" ON "playground_sessions"("workspaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "playground_sessions_agentId_idx" ON "playground_sessions"("agentId");

-- CreateIndex
CREATE INDEX "playground_sessions_userId_idx" ON "playground_sessions"("userId");

-- AddForeignKey
ALTER TABLE "ai_integrations" ADD CONSTRAINT "ai_integrations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_cache" ADD CONSTRAINT "ai_model_cache_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "ai_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "ai_integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_activePromptVersionId_fkey" FOREIGN KEY ("activePromptVersionId") REFERENCES "agent_prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_prompt_versions" ADD CONSTRAINT "agent_prompt_versions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_prompt_versions" ADD CONSTRAINT "agent_prompt_versions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistants" ADD CONSTRAINT "assistants_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistants" ADD CONSTRAINT "assistants_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_runtime_settings" ADD CONSTRAINT "assistant_runtime_settings_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "assistants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "widget_instances" ADD CONSTRAINT "widget_instances_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "widget_instances" ADD CONSTRAINT "widget_instances_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "assistants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "widget_domains" ADD CONSTRAINT "widget_domains_widgetId_fkey" FOREIGN KEY ("widgetId") REFERENCES "widget_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "assistants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_widgetId_fkey" FOREIGN KEY ("widgetId") REFERENCES "widget_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playground_sessions" ADD CONSTRAINT "playground_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playground_sessions" ADD CONSTRAINT "playground_sessions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playground_sessions" ADD CONSTRAINT "playground_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
