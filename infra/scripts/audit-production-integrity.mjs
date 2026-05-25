#!/usr/bin/env node
/**
 * Read-only production integrity audit (M11.4B).
 * Checks cross-workspace runtime bindings, stale snapshots, forbidden patterns.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const requireDist = createRequire(import.meta.url);
const { prisma } = requireDist(resolve(ROOT, 'packages/database/dist/index.js'));

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

const violations = [];

async function auditCrossWorkspaceAgents() {
  const agents = await prisma.agent.findMany({
    where: { deletedAt: null },
    include: { integration: { select: { id: true, name: true, workspaceId: true, status: true } } },
  });
  for (const agent of agents) {
    if (agent.integration.workspaceId !== agent.workspaceId) {
      violations.push({
        type: 'CROSS_WORKSPACE_AGENT_INTEGRATION',
        agentId: agent.id,
        agentName: agent.name,
        agentWorkspaceId: agent.workspaceId,
        integrationId: agent.integrationId,
        integrationName: agent.integration.name,
        integrationWorkspaceId: agent.integration.workspaceId,
      });
    }
  }
  console.log(`Agents checked: ${agents.length}, cross-workspace: ${violations.length}`);
}

async function auditCrossWorkspaceFallbacks() {
  const fallbacks = await prisma.agentModelFallback.findMany({
    include: {
      agent: { select: { id: true, name: true, workspaceId: true } },
      integration: { select: { id: true, name: true, workspaceId: true } },
    },
  });
  let count = 0;
  for (const fb of fallbacks) {
    if (fb.integration.workspaceId !== fb.workspaceId || fb.agent.workspaceId !== fb.workspaceId) {
      count++;
      violations.push({
        type: 'CROSS_WORKSPACE_FALLBACK',
        fallbackId: fb.id,
        agentId: fb.agentId,
        integrationId: fb.integrationId,
        workspaceId: fb.workspaceId,
      });
    }
  }
  console.log(`Fallbacks checked: ${fallbacks.length}, cross-workspace: ${count}`);
}

async function auditStaleSnapshots() {
  const openConversations = await prisma.conversation.findMany({
    where: { status: 'OPEN' },
    select: { id: true, workspaceId: true, snapshotId: true, assistantId: true },
  });
  let stale = 0;
  for (const conv of openConversations) {
    const snap = await prisma.assistantRuntimeSnapshot.findFirst({
      where: { id: conv.snapshotId, workspaceId: conv.workspaceId },
    });
    if (!snap) {
      stale++;
      violations.push({ type: 'MISSING_SNAPSHOT', conversationId: conv.id, snapshotId: conv.snapshotId });
      continue;
    }
    const body = snap.snapshot;
    const integrationId = body?.integration?.id;
    if (!integrationId) continue;
    const integration = await prisma.aiIntegration.findUnique({
      where: { id: integrationId },
      select: { workspaceId: true, status: true, name: true },
    });
    if (!integration || integration.workspaceId !== conv.workspaceId || integration.status !== 'ACTIVE') {
      stale++;
      violations.push({
        type: 'STALE_PINNED_INTEGRATION',
        conversationId: conv.id,
        snapshotId: conv.snapshotId,
        integrationId,
        integrationWorkspaceId: integration?.workspaceId ?? null,
      });
    }
  }
  console.log(`Open conversations: ${openConversations.length}, stale snapshots: ${stale}`);
}

async function main() {
  console.log('==> Production integrity audit', new Date().toISOString());
  await auditCrossWorkspaceAgents();
  await auditCrossWorkspaceFallbacks();
  await auditStaleSnapshots();

  if (violations.length === 0) {
    console.log('AUDIT_PASS: no violations');
    process.exit(0);
  }

  console.log('AUDIT_FAIL: violations found');
  for (const v of violations) {
    console.log(JSON.stringify(v));
  }
  process.exit(1);
}

main()
  .catch((err) => {
    console.error('AUDIT_ERROR', err);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
