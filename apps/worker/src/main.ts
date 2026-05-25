import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { prisma } from '@botme/database';
import { startSyncModelsWorker } from './jobs/sync-models.worker.js';
import { startKbWorkers } from './jobs/kb-ingestion.worker.js';

loadEnv({ path: resolve(process.cwd(), '../../.env'), override: true });

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

const healthQueue = new Queue('botme.health', { connection });

new Worker(
  'botme.health',
  async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, at: new Date().toISOString() };
  },
  { connection },
);

async function bootstrap(): Promise<void> {
  await prisma.$connect();
  startSyncModelsWorker();
  startKbWorkers();
  await healthQueue.add('ping', {}, { repeat: { every: 60_000 } });
  console.info('[worker] Botme worker started — integration.sync-models, kb.*, health');
}

bootstrap().catch((err: unknown) => {
  console.error('[worker] fatal', err);
  process.exit(1);
});
