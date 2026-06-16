-- Integration-level default model failover chain
CREATE TABLE "integration_model_chain" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "modelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "timeoutMs" INTEGER NOT NULL DEFAULT 120000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_model_chain_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_model_chain_integrationId_position_key"
  ON "integration_model_chain"("integrationId", "position");
CREATE INDEX "integration_model_chain_integrationId_enabled_idx"
  ON "integration_model_chain"("integrationId", "enabled");
CREATE INDEX "integration_model_chain_workspaceId_integrationId_idx"
  ON "integration_model_chain"("workspaceId", "integrationId");

ALTER TABLE "integration_model_chain" ADD CONSTRAINT "integration_model_chain_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_model_chain" ADD CONSTRAINT "integration_model_chain_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "ai_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
