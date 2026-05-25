import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { prisma } from '@botme/database';
import { aiProviderFactory } from '@botme/ai-core';
import type { AiProviderType } from '@botme/database';
import { EnvelopeEncryptionService } from '@botme/crypto';
import type { ModelDefinition } from '@botme/ai-core';

loadEnv({ path: resolve(process.cwd(), '../../.env'), override: true });

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

interface SyncJobData {
  integrationId: string;
  workspaceId: string;
}

async function upsertModels(
  integrationId: string,
  provider: AiProviderType,
  models: ModelDefinition[],
): Promise<number> {
  const syncedAt = new Date();
  for (const model of models) {
    await prisma.aiModelCache.upsert({
      where: { integrationId_externalId: { integrationId, externalId: model.externalId } },
      create: {
        integrationId,
        externalId: model.externalId,
        provider,
        displayName: model.displayName,
        contextWindow: model.contextWindow,
        promptPrice: model.promptPrice,
        completionPrice: model.completionPrice,
        supportsTools: model.supportsTools,
        supportsVision: model.supportsVision,
        supportsReasoning: model.supportsReasoning,
        isFree: model.isFree,
        syncedAt,
      },
      update: {
        displayName: model.displayName,
        contextWindow: model.contextWindow,
        promptPrice: model.promptPrice,
        completionPrice: model.completionPrice,
        supportsTools: model.supportsTools,
        supportsVision: model.supportsVision,
        supportsReasoning: model.supportsReasoning,
        isFree: model.isFree,
        syncedAt,
      },
    });
  }
  const externalIds = models.map((m) => m.externalId);
  if (externalIds.length > 0) {
    await prisma.aiModelCache.deleteMany({
      where: { integrationId, externalId: { notIn: externalIds } },
    });
  }
  return models.length;
}

async function processSync(data: SyncJobData): Promise<{ synced: number }> {
  const integration = await prisma.aiIntegration.findFirst({
    where: { id: data.integrationId, workspaceId: data.workspaceId, deletedAt: null },
  });
  if (!integration) {
    throw new Error('Integration not found');
  }

  const masterKey = process.env['MASTER_ENCRYPTION_KEY'];
  if (!masterKey || masterKey.length !== 64) {
    throw new Error('MASTER_ENCRYPTION_KEY invalid');
  }

  const crypto = new EnvelopeEncryptionService(masterKey);
  const encryptedSecret = Buffer.from(integration.encryptedSecret);
  const unpacked = crypto.unpack(encryptedSecret, integration.keyVersion);
  const apiKey = crypto.decrypt(unpacked, data.workspaceId);

  const adapter = aiProviderFactory.create(integration.provider, { apiKey });
  const models = await adapter.listModels();
  const synced = await upsertModels(integration.id, integration.provider, models);

  await prisma.aiIntegration.update({
    where: { id: integration.id },
    data: {
      status: 'ACTIVE',
      lastValidatedAt: new Date(),
      health: { modelCount: synced, syncedAt: new Date().toISOString() },
    },
  });

  return { synced };
}

export function startSyncModelsWorker(): Worker {
  return new Worker<SyncJobData>(
    'integration.sync-models',
    async (job) => processSync(job.data),
    { connection, concurrency: 2 },
  );
}
