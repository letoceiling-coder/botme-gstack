-- M3: Agent description, PlaygroundMessage, session usage tracking
ALTER TABLE "agents" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';

ALTER TABLE "playground_sessions" ADD COLUMN "promptVersionId" TEXT;
ALTER TABLE "playground_sessions" ADD COLUMN "totalPromptTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "playground_sessions" ADD COLUMN "totalCompletionTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "playground_sessions" ADD COLUMN "totalTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "playground_sessions" ADD COLUMN "lastLatencyMs" INTEGER;
ALTER TABLE "playground_sessions" ADD COLUMN "lastProvider" "AiProviderType";
ALTER TABLE "playground_sessions" ADD COLUMN "lastModel" TEXT;

CREATE TABLE "playground_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "PlaygroundMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playground_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "playground_messages_sessionId_createdAt_idx" ON "playground_messages"("sessionId", "createdAt");

ALTER TABLE "playground_messages" ADD CONSTRAINT "playground_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "playground_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
