#!/usr/bin/env node
/**
 * Create or update workspace OpenRouter integration "Default" with model failover chain.
 *
 * Usage (production):
 *   OPENROUTER_API_KEY=sk-or-v1-... WORKSPACE_ID=... node infra/scripts/seed-default-integration.mjs
 *
 * Optional: SET_DEFAULT=1 to mark as default integration (clears other defaults).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const requireDist = createRequire(import.meta.url);

const { prisma } = requireDist(resolve(ROOT, 'packages/database/dist/index.js'));
const { EnvelopeEncryptionService } = requireDist(resolve(ROOT, 'packages/crypto/dist/index.js'));

const MODEL_CHAIN = [
  'openrouter/free',
  'openai/gpt-4o-mini',
  'deepseek/deepseek-chat-v3-0324',
  'qwen/qwen-2.5-7b-instruct',
];

function loadEnv() {
  try {
    const raw = readFileSync(resolve(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* optional */
  }
}

loadEnv();

const apiKey = process.env['OPENROUTER_API_KEY'];
const workspaceId = process.env['WORKSPACE_ID'];
const setDefault = process.env['SET_DEFAULT'] === '1';
const INTEGRATION_NAME = process.env['INTEGRATION_NAME'] ?? 'Default';

async function main() {
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is required');
    process.exit(1);
  }

  let wsId = workspaceId;
  if (!wsId) {
    const ws = await prisma.workspace.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!ws) {
      console.error('No workspace found; set WORKSPACE_ID');
      process.exit(1);
    }
    wsId = ws.id;
    console.log(`Using workspace ${ws.slug} (${wsId})`);
  }

  const masterKey = process.env['MASTER_ENCRYPTION_KEY'];
  if (!masterKey || masterKey.length !== 64) {
    console.error('MASTER_ENCRYPTION_KEY must be 64 hex chars (from server .env)');
    process.exit(1);
  }
  const crypto = new EnvelopeEncryptionService(masterKey);
  const payload = crypto.encrypt(apiKey.trim(), wsId, 1);
  const stored = {
    encryptedSecret: crypto.pack(payload),
    keyVersion: payload.keyVersion,
  };

  let integration = await prisma.aiIntegration.findFirst({
    where: { workspaceId: wsId, provider: 'OPENROUTER', name: INTEGRATION_NAME, deletedAt: null },
  });

  if (integration) {
    integration = await prisma.aiIntegration.update({
      where: { id: integration.id },
      data: {
        encryptedSecret: Buffer.from(stored.encryptedSecret),
        keyVersion: stored.keyVersion,
        status: 'PENDING_VALIDATION',
        ...(setDefault ? { isDefault: true } : {}),
      },
    });
    console.log(`Updated integration ${integration.id}`);
  } else {
    integration = await prisma.aiIntegration.create({
      data: {
        workspaceId: wsId,
        provider: 'OPENROUTER',
        name: INTEGRATION_NAME,
        encryptedSecret: Buffer.from(stored.encryptedSecret),
        keyVersion: stored.keyVersion,
        isDefault: setDefault,
        status: 'PENDING_VALIDATION',
      },
    });
    console.log(`Created integration ${integration.id}`);
  }

  if (setDefault) {
    await prisma.aiIntegration.updateMany({
      where: { workspaceId: wsId, id: { not: integration.id }, deletedAt: null },
      data: { isDefault: false },
    });
  }

  await prisma.integrationModelChainItem.deleteMany({
    where: { integrationId: integration.id, workspaceId: wsId },
  });
  await prisma.integrationModelChainItem.createMany({
    data: MODEL_CHAIN.map((modelId, index) => ({
      workspaceId: wsId,
      integrationId: integration.id,
      position: index + 1,
      modelId,
      enabled: true,
      maxRetries: 2,
      timeoutMs: 120_000,
    })),
  });

  console.log(`Model chain (${MODEL_CHAIN.length}): ${MODEL_CHAIN.join(' → ')}`);
  console.log('Run validate/sync via admin UI or integration.sync-models worker.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
