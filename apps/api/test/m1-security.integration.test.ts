import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { EnvelopeEncryptionService } from '@botme/crypto';
import { prisma } from '@botme/database';
import { IntegrationRepository } from '../src/modules/foundation/infrastructure/integration.repository';
import { WidgetAuthService } from '../src/modules/foundation/application/widget-auth.service';
import { WidgetRepository } from '../src/modules/foundation/infrastructure/widget.repository';
import { PrismaService } from '../src/core/prisma/prisma.service';

config({ path: resolve(__dirname, '../../../.env'), override: true });

const MASTER_KEY =
  process.env['MASTER_ENCRYPTION_KEY'] ??
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('M1 security integration', () => {
  const prismaService = { client: prisma } as PrismaService;
  const integrations = new IntegrationRepository(prismaService);
  const widgets = new WidgetRepository(prismaService);
  const widgetAuth = new WidgetAuthService(widgets, {
    verify: () => {
      throw new Error('preview disabled');
    },
    isTrustedPreviewOrigin: () => false,
  } as import('./widget-preview-token.service').WidgetPreviewTokenService);

  let workspaceA: string;
  let workspaceB: string;
  let integrationA: string;
  let widgetPublicKey: string;
  let ownerUserId: string;

  beforeAll(async () => {
    if (process.env['RUN_INTEGRATION'] !== '1') {
      return;
    }

    const crypto = new EnvelopeEncryptionService(MASTER_KEY);
    const suffix = Date.now();

    const wsA = await prisma.workspace.create({
      data: { slug: `m1-a-${suffix}`, name: 'M1 A' },
    });
    const wsB = await prisma.workspace.create({
      data: { slug: `m1-b-${suffix}`, name: 'M1 B' },
    });
    workspaceA = wsA.id;
    workspaceB = wsB.id;

    const owner = await prisma.user.create({
      data: {
        email: `m1-owner-${suffix}@botme.test`,
        passwordHash: 'hash',
        name: 'Owner',
      },
    });
    ownerUserId = owner.id;
    await prisma.workspaceMember.create({
      data: { workspaceId: workspaceA, userId: owner.id, role: 'OWNER' },
    });

    const packed = crypto.pack(crypto.encrypt('sk-test-key', workspaceA));
    const integration = await prisma.aiIntegration.create({
      data: {
        workspaceId: workspaceA,
        provider: 'OPENAI',
        name: 'Primary',
        encryptedSecret: packed,
        keyVersion: 1,
        status: 'ACTIVE',
      },
    });
    integrationA = integration.id;

    const agent = await prisma.agent.create({
      data: {
        workspaceId: workspaceA,
        integrationId: integrationA,
        modelId: 'gpt-4o-mini',
        name: 'Test Agent',
        systemPrompt: 'You are helpful.',
      },
    });

    const assistant = await prisma.assistant.create({
      data: {
        workspaceId: workspaceA,
        agentId: agent.id,
        name: 'Test Assistant',
        slug: `test-assistant-${suffix}`,
        welcomeMessage: 'Hello',
        status: 'ACTIVE',
        isActive: true,
        createdBy: ownerUserId,
        runtimeSettings: { create: {} },
      },
    });

    widgetPublicKey = `wm_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const widget = await prisma.widgetInstance.create({
      data: {
        workspaceId: workspaceA,
        assistantId: assistant.id,
        publicKey: widgetPublicKey,
        name: 'Site Widget',
        domains: {
          create: [{ domain: 'localhost' }],
        },
      },
    });
    expect(widget.id).toBeDefined();
  }, 30_000);

  it('isolates integrations by workspace', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1') return;

    const inA = await integrations.findById(workspaceA, integrationA);
    expect(inA?.id).toBe(integrationA);

    const cross = await integrations.findById(workspaceB, integrationA);
    expect(cross).toBeNull();
  });

  it('rejects widget with wrong domain', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1') return;

    await expect(
      widgetAuth.authenticate(widgetPublicKey, 'https://evil.example.com'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts widget with allowed domain', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1') return;

    const session = await widgetAuth.authenticate(widgetPublicKey, 'http://localhost:5174');
    expect(session.workspaceId).toBe(workspaceA);
    expect(session.publicKey).toBe(widgetPublicKey);
  });

  it('rejects unknown widget key', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1') return;

    await expect(
      widgetAuth.authenticate('wm_unknown_key', 'http://localhost:5174'),
    ).rejects.toThrow(UnauthorizedException);
  });
});
