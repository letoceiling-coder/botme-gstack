#!/usr/bin/env node
/**
 * Repair cross-workspace agent integration bindings + stale widget snapshots (M11.4B).
 * Safe: UPDATE only, no deletes/truncates/resets.
 *
 * Usage:
 *   node infra/scripts/repair-runtime-bindings.mjs [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const requireDist = createRequire(import.meta.url);
const { prisma } = requireDist(resolve(ROOT, 'packages/database/dist/index.js'));

const DRY_RUN = process.argv.includes('--dry-run');

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

async function pickLocalIntegration(workspaceId) {
  const preferred = await prisma.aiIntegration.findFirst({
    where: {
      workspaceId,
      status: 'ACTIVE',
      deletedAt: null,
      OR: [
        { name: { contains: 'dental', mode: 'insensitive' } },
        { name: { contains: 'openrouter', mode: 'insensitive' } },
      ],
    },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  if (preferred) return preferred;

  return prisma.aiIntegration.findFirst({
    where: { workspaceId, status: 'ACTIVE', deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
}

function buildSnapshotBody(assistant) {
  const settings = assistant.runtimeSettings;
  return {
    assistant: {
      id: assistant.id,
      name: assistant.name,
      slug: assistant.slug,
      welcomeMessage: assistant.welcomeMessage,
      placeholder: assistant.placeholder,
      tone: assistant.tone,
      language: assistant.language,
      visibility: assistant.visibility,
      isActive: assistant.isActive,
    },
    agent: {
      id: assistant.agent.id,
      name: assistant.agent.name,
      modelId: assistant.agent.modelId,
      temperature: assistant.agent.temperature,
      topP: assistant.agent.topP,
      maxTokens: assistant.agent.maxTokens,
      status: assistant.agent.status,
    },
    promptVersion: {
      id: assistant.agent.activePromptVersion.id,
      version: assistant.agent.activePromptVersion.version,
      content: assistant.agent.activePromptVersion.content,
    },
    integration: {
      id: assistant.agent.integration.id,
      name: assistant.agent.integration.name,
      provider: assistant.agent.integration.provider,
      status: assistant.agent.integration.status,
    },
    knowledgeBases: assistant.knowledgeBases
      .filter((kb) => kb.knowledgeBase.status === 'ACTIVE' && !kb.knowledgeBase.deletedAt)
      .map((kb) => ({
        id: kb.knowledgeBase.id,
        name: kb.knowledgeBase.name,
        description: kb.knowledgeBase.description,
        status: kb.knowledgeBase.status,
      })),
    tools: assistant.tools
      .filter((t) => t.tool.status === 'ACTIVE' && !t.tool.deletedAt && t.tool.enabled)
      .map((t) => ({
        id: t.tool.id,
        name: t.tool.name,
        description: t.tool.description,
        type: t.tool.type,
        status: t.tool.status,
        schema: t.tool.schema,
      })),
    runtimeSettings: {
      maxContextMessages: settings?.maxContextMessages ?? 20,
      memoryEnabled: settings?.memoryEnabled ?? true,
      citationsEnabled: settings?.citationsEnabled ?? false,
      moderationEnabled: settings?.moderationEnabled ?? true,
      fallbackMessage: settings?.fallbackMessage ?? 'Извините, я не могу ответить сейчас.',
      typingSimulation: settings?.typingSimulation ?? true,
      streamingEnabled: settings?.streamingEnabled ?? true,
      widgetPosition: settings?.widgetPosition ?? 'bottom-right',
      language: settings?.language ?? assistant.language,
      offlineMessage: settings?.offlineMessage ?? null,
    },
  };
}

async function repairAgents() {
  const agents = await prisma.agent.findMany({
    where: { deletedAt: null },
    include: { integration: { select: { id: true, name: true, workspaceId: true } } },
  });

  let repaired = 0;
  for (const agent of agents) {
    if (agent.integration.workspaceId === agent.workspaceId) continue;

    const local = await pickLocalIntegration(agent.workspaceId);
    if (!local) {
      console.warn(`SKIP agent ${agent.id} (${agent.name}): no local integration in ${agent.workspaceId}`);
      continue;
    }

    console.log(
      `REBIND agent ${agent.id} (${agent.name}): ${agent.integration.name}@${agent.integration.workspaceId} -> ${local.name}@${local.id}`,
    );
    if (!DRY_RUN) {
      await prisma.agent.update({
        where: { id: agent.id },
        data: { integrationId: local.id },
      });
    }
    repaired++;
  }
  console.log(`Agents rebound: ${repaired}${DRY_RUN ? ' (dry-run)' : ''}`);
  return repaired;
}

async function repairFallbacks() {
  const fallbacks = await prisma.agentModelFallback.findMany({
    include: { integration: { select: { workspaceId: true } }, agent: { select: { workspaceId: true } } },
  });
  let removed = 0;
  for (const fb of fallbacks) {
    if (fb.integration.workspaceId === fb.workspaceId && fb.agent.workspaceId === fb.workspaceId) continue;
    console.log(`REMOVE cross-workspace fallback ${fb.id} agent=${fb.agentId}`);
    if (!DRY_RUN) {
      await prisma.agentModelFallback.delete({ where: { id: fb.id } });
    }
    removed++;
  }
  console.log(`Fallbacks removed: ${removed}${DRY_RUN ? ' (dry-run)' : ''}`);
}

async function repairSnapshots() {
  const graphInclude = {
    agent: {
      include: {
        integration: { select: { id: true, name: true, provider: true, status: true, workspaceId: true } },
        activePromptVersion: { select: { id: true, version: true, content: true } },
      },
    },
    runtimeSettings: true,
    knowledgeBases: { include: { knowledgeBase: true } },
    tools: { include: { tool: true } },
  };

  const openConversations = await prisma.conversation.findMany({
    where: { status: 'OPEN' },
    select: { id: true, workspaceId: true, snapshotId: true, assistantId: true },
  });

  let refreshed = 0;
  for (const conv of openConversations) {
    const snap = await prisma.assistantRuntimeSnapshot.findFirst({
      where: { id: conv.snapshotId, workspaceId: conv.workspaceId },
    });
    if (!snap) {
      console.log(`REFRESH missing snapshot conv=${conv.id}`);
    } else {
      const body = snap.snapshot;
      const integrationId = body?.integration?.id;
      const integration = integrationId
        ? await prisma.aiIntegration.findUnique({
            where: { id: integrationId },
            select: { workspaceId: true, status: true },
          })
        : null;
      if (integration && integration.workspaceId === conv.workspaceId && integration.status === 'ACTIVE') {
        continue;
      }
      console.log(`REFRESH stale snapshot conv=${conv.id} integration=${integrationId}`);
    }

    const assistant = await prisma.assistant.findFirst({
      where: { id: conv.assistantId, workspaceId: conv.workspaceId, deletedAt: null },
      include: graphInclude,
    });
    if (!assistant?.agent?.activePromptVersion) {
      console.warn(`SKIP conv ${conv.id}: assistant graph incomplete`);
      continue;
    }
    if (assistant.agent.integration.workspaceId !== conv.workspaceId) {
      console.warn(`SKIP conv ${conv.id}: agent still cross-workspace after repair`);
      continue;
    }

    const snapshotBody = buildSnapshotBody(assistant);
    if (!DRY_RUN) {
      const row = await prisma.assistantRuntimeSnapshot.create({
        data: {
          workspaceId: conv.workspaceId,
          assistantId: conv.assistantId,
          snapshot: snapshotBody,
        },
      });
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { snapshotId: row.id },
      });
    }
    refreshed++;
  }
  console.log(`Snapshots refreshed: ${refreshed}${DRY_RUN ? ' (dry-run)' : ''}`);
}

async function main() {
  console.log(`==> Repair runtime bindings${DRY_RUN ? ' (DRY RUN)' : ''}`);
  await repairAgents();
  await repairFallbacks();
  await repairSnapshots();
  console.log('==> Repair complete');
}

main()
  .catch((err) => {
    console.error('REPAIR_ERROR', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
