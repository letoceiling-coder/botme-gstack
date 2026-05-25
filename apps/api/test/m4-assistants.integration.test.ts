import { config } from 'dotenv';
import { resolve } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';

config({ path: resolve(__dirname, '../../../.env'), override: true });

const port = Number(process.env['API_PORT'] ?? 3010) || 3010;
const API = `http://127.0.0.1:${port}`;
const agent = () => request(API);

describe('M4 assistants API', () => {
  let cookieHeader = '';
  let agentId = '';
  let assistantId = '';
  let kbId = '';
  const email = `m4-${Date.now()}@botme.test`;

  beforeAll(async () => {
    if (process.env['RUN_INTEGRATION'] !== '1') return;

    const register = await agent()
      .post('/auth/register')
      .send({ email, password: 'password123', name: 'M4', workspaceName: 'M4 WS' })
      .expect(201);

    cookieHeader = Array.isArray(register.headers['set-cookie'])
      ? register.headers['set-cookie'].join('; ')
      : String(register.headers['set-cookie']);

    const integrations = await agent().get('/integrations').set('Cookie', cookieHeader);
    const integration = integrations.body.find((i: { status: string }) => i.status === 'ACTIVE');

    if (integration) {
      const createdAgent = await agent()
        .post('/agents')
        .set('Cookie', cookieHeader)
        .send({
          name: 'M4 Agent',
          integrationId: integration.id,
          modelId: 'openai/gpt-4o-mini',
          systemPrompt: 'Test assistant agent.',
        });
      agentId = createdAgent.body.id;
    }

    const kb = await agent()
      .post('/knowledge-bases')
      .set('Cookie', cookieHeader)
      .send({ name: 'Stub KB' });
    kbId = kb.body.id;
  }, 60_000);

  it('creates assistant with required agent', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1' || !agentId) return;

    const res = await agent()
      .post('/assistants')
      .set('Cookie', cookieHeader)
      .send({
        name: 'Support Assistant',
        agentId,
        welcomeMessage: 'Hi!',
      })
      .expect(201);

    expect(res.body.agentId).toBe(agentId);
    expect(res.body.runtimeSettings).toBeDefined();
    assistantId = res.body.id;
  });

  it('binds knowledge base', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1' || !assistantId || !kbId) return;

    const res = await agent()
      .post(`/assistants/${assistantId}/kbs`)
      .set('Cookie', cookieHeader)
      .send({ knowledgeBaseIds: [kbId] })
      .expect(201);

    expect(res.body.knowledgeBaseIds).toContain(kbId);
  });

  it('returns runtime snapshot without secrets', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1' || !assistantId) return;

    const res = await agent()
      .get(`/assistants/${assistantId}/runtime`)
      .set('Cookie', cookieHeader)
      .expect(200);

    expect(res.body.agent.modelId).toBeDefined();
    expect(res.body.integration.provider).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/apiKey|encryptedSecret/i);
    expect(res.body.snapshotId).toBeDefined();
  });
});
