-- M10.4 Agent model failover chain
CREATE TABLE "agent_model_fallbacks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "integrationId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "timeoutMs" INTEGER NOT NULL DEFAULT 120000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_model_fallbacks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_model_fallbacks_agentId_position_key" ON "agent_model_fallbacks"("agentId", "position");
CREATE INDEX "agent_model_fallbacks_agentId_enabled_idx" ON "agent_model_fallbacks"("agentId", "enabled");
CREATE INDEX "agent_model_fallbacks_workspaceId_agentId_idx" ON "agent_model_fallbacks"("workspaceId", "agentId");

ALTER TABLE "agent_model_fallbacks" ADD CONSTRAINT "agent_model_fallbacks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_model_fallbacks" ADD CONSTRAINT "agent_model_fallbacks_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_model_fallbacks" ADD CONSTRAINT "agent_model_fallbacks_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "ai_integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
