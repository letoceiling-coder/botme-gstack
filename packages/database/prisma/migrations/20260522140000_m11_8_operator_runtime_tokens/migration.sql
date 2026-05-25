-- CreateTable
CREATE TABLE "operator_runtime_tokens" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "widgetId" TEXT,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operator_runtime_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operator_runtime_tokens_tokenHash_key" ON "operator_runtime_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "operator_runtime_tokens_workspaceId_idx" ON "operator_runtime_tokens"("workspaceId");

-- CreateIndex
CREATE INDEX "operator_runtime_tokens_widgetId_idx" ON "operator_runtime_tokens"("widgetId");

-- AddForeignKey
ALTER TABLE "operator_runtime_tokens" ADD CONSTRAINT "operator_runtime_tokens_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_runtime_tokens" ADD CONSTRAINT "operator_runtime_tokens_widgetId_fkey" FOREIGN KEY ("widgetId") REFERENCES "widget_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_runtime_tokens" ADD CONSTRAINT "operator_runtime_tokens_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
