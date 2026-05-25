-- AlterTable
ALTER TABLE "operator_runtime_tokens" ADD COLUMN "tokenEncrypted" BYTEA;
ALTER TABLE "operator_runtime_tokens" ADD COLUMN "keyVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "operator_runtime_tokens" ADD COLUMN "exchangeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "operator_runtime_tokens" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
