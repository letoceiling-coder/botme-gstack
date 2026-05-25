-- M5: Conversation snapshot pinning + message metadata

ALTER TABLE "conversations" ADD COLUMN "snapshotId" TEXT;
ALTER TABLE "conversations" ADD COLUMN "lastMessageAt" TIMESTAMP(3);

ALTER TABLE "messages" ADD COLUMN "latencyMs" INTEGER;
ALTER TABLE "messages" ADD COLUMN "providerMessageId" TEXT;

DELETE FROM "messages" WHERE "conversationId" IN (SELECT "id" FROM "conversations");
DELETE FROM "conversations";

ALTER TABLE "conversations" ALTER COLUMN "snapshotId" SET NOT NULL;

CREATE INDEX "conversations_widgetId_visitorId_status_idx"
  ON "conversations"("widgetId", "visitorId", "status");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "assistant_runtime_snapshots"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
