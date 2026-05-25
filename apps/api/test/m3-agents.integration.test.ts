import { config } from 'dotenv';
import { resolve } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';

config({ path: resolve(__dirname, '../../../.env'), override: true });

const port = Number(process.env['API_PORT'] ?? 3010) || 3010;
const API = `http://127.0.0.1:${port}`;
const agent = () => request(API);

describe('M3 agents API', () => {
  let cookieHeader = '';
  let integrationId = '';
  let agentId = '';
  const email = `m3-${Date.now()}@botme.test`;

  beforeAll(async () => {
    if (process.env['RUN_INTEGRATION'] !== '1') return;

    const register = await agent()
      .post('/auth/register')
      .send({
        email,
        password: 'password123',
        name: 'M3 User',
        workspaceName: 'M3 WS',
      })
      .expect(201);

    const cookies = register.headers['set-cookie'];
    cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : String(cookies);

    const integrations = await agent()
      .get('/integrations')
      .set('Cookie', cookieHeader)
      .expect(200);

    const active = (integrations.body as Array<{ id: string; status: string }>).find(
      (i) => i.status === 'ACTIVE',
    );
    integrationId = active?.id ?? '';
  }, 30_000);

  it('creates agent with prompt version v1', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1' || !integrationId) return;

    const res = await agent()
      .post('/agents')
      .set('Cookie', cookieHeader)
      .send({
        name: 'Test Agent',
        description: 'M3 test',
        integrationId,
        modelId: 'openai/gpt-4o-mini',
        systemPrompt: 'You are a test assistant. Reply in one short sentence.',
      })
      .expect(201);

    expect(res.body.name).toBe('Test Agent');
    expect(res.body.promptVersions).toHaveLength(1);
    expect(res.body.activeVersion).toBe(1);
    agentId = res.body.id as string;
  }, 30_000);

  it('lists agents scoped to workspace', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1' || !agentId) return;

    const res = await agent().get('/agents').set('Cookie', cookieHeader).expect(200);
    expect(res.body.some((a: { id: string }) => a.id === agentId)).toBe(true);
  });

  it('creates and activates prompt version 2', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1' || !agentId) return;

    const res = await agent()
      .post(`/agents/${agentId}/prompts`)
      .set('Cookie', cookieHeader)
      .send({ content: 'Updated system prompt v2.', activate: true })
      .expect(201);

    expect(res.body.promptVersions).toHaveLength(2);
    expect(res.body.activeVersion).toBe(2);
    expect(res.body.systemPrompt).toBe('Updated system prompt v2.');
  });

  it('returns playground session null for new agent', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1' || !agentId) return;

    const res = await agent()
      .get(`/playground/sessions/${agentId}`)
      .set('Cookie', cookieHeader)
      .expect(200);

    expect(res.body).toBeNull();
  });
});
