import { config } from 'dotenv';
import { resolve } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import { prisma } from '@botme/database';

config({ path: resolve(__dirname, '../../../.env'), override: true });

const port = Number(process.env['API_PORT'] ?? 3010) || 3010;
const API = `http://127.0.0.1:${port}`;
const agent = () => request(API);

describe('M2 integrations API', () => {
  let cookieHeader = '';
  let userId = '';
  let workspaceId = '';
  let integrationId = '';
  const email = `m2-${Date.now()}@botme.test`;

  beforeAll(async () => {
    if (process.env['RUN_INTEGRATION'] !== '1') return;

    const register = await agent()
      .post('/auth/register')
      .send({
        email,
        password: 'password123',
        name: 'M2 User',
        workspaceName: 'M2 WS',
      })
      .expect(201);

    userId = register.body.user.id as string;
    workspaceId = register.body.workspace.id as string;
    const cookies = register.headers['set-cookie'];
    cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : String(cookies);
  }, 30_000);

  it(
    'creates integration with masked key only',
    async () => {
      if (process.env['RUN_INTEGRATION'] !== '1') return;

      const fakeKey = `sk-test-${Date.now()}-abcdefghijklmnop`;
      const res = await agent()
        .post('/integrations')
        .set('Cookie', cookieHeader)
        .send({
          provider: 'OPENROUTER',
          name: 'Test OR',
          apiKey: fakeKey,
        })
        .expect(201);

      expect(res.body.maskedKey).toBeDefined();
      expect(res.body.maskedKey).not.toBe(fakeKey);
      expect(JSON.stringify(res.body)).not.toContain(fakeKey);
      integrationId = res.body.id as string;
    },
    120_000,
  );

  it('lists integrations scoped to workspace', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1' || !integrationId) return;

    const res = await agent().get('/integrations').set('Cookie', cookieHeader).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((i: { id: string }) => i.id === integrationId)).toBe(true);
  });

  it('returns models cache array', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1' || !integrationId) return;

    const res = await agent()
      .get(`/integrations/${integrationId}/models`)
      .set('Cookie', cookieHeader)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('queues model sync job', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1' || !integrationId) return;

    const res = await agent()
      .post(`/integrations/${integrationId}/sync-models`)
      .set('Cookie', cookieHeader)
      .send({})
      .expect(202);

    expect(res.body.queued).toBe(true);
    expect(res.body.jobId).toBeDefined();
  });

  it('forbids VIEWER from creating integrations', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1' || !userId) return;

    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId } },
      data: { role: 'VIEWER' },
    });

    const refresh = await agent()
      .post('/auth/refresh')
      .set('Cookie', cookieHeader)
      .expect(200);
    const newCookies = refresh.headers['set-cookie'];
    const viewerCookie = Array.isArray(newCookies) ? newCookies.join('; ') : String(newCookies);

    await agent()
      .post('/integrations')
      .set('Cookie', viewerCookie)
      .send({
        provider: 'OPENROUTER',
        name: 'Blocked',
        apiKey: 'sk-test-blocked-key-12345678',
      })
      .expect(403);

    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId } },
      data: { role: 'OWNER' },
    });
  });
});
