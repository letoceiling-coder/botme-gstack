import { config } from 'dotenv';
import { resolve } from 'node:path';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { io, type Socket } from 'socket.io-client';

config({ path: resolve(__dirname, '../../../.env'), override: true });

const port = Number(process.env['API_PORT'] ?? 3010) || 3010;
const API = `http://127.0.0.1:${port}`;

function connectWidget(widgetKey: string, origin = 'http://localhost'): Promise<Socket> {
  return new Promise((resolveSocket, reject) => {
    const socket = io(`${API}/widget`, {
      query: { widgetKey },
      transports: ['websocket'],
      extraHeaders: { Origin: origin },
    });
    socket.on('connect', () => resolveSocket(socket));
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('connect timeout')), 10_000);
  });
}

function waitFor<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolveEvt, reject) => {
    socket.once(event, resolveEvt);
    setTimeout(() => reject(new Error(`timeout ${event}`)), 15_000);
  });
}

describe('M5 widget chat', () => {
  let widgetKey = '';
  let conversationId = '';
  let visitorId = '';

  beforeAll(async () => {
    if (process.env['RUN_INTEGRATION'] !== '1') return;

    const request = (await import('supertest')).default;
    const agent = () => request(API);
    const email = `m5-${Date.now()}@botme.test`;

    const register = await agent()
      .post('/auth/register')
      .send({ email, password: 'password123', name: 'M5', workspaceName: 'M5 WS' })
      .expect(201);

    const cookie = Array.isArray(register.headers['set-cookie'])
      ? register.headers['set-cookie'].join('; ')
      : String(register.headers['set-cookie']);

    const integrations = await agent().get('/integrations').set('Cookie', cookie);
    const integration = integrations.body.find((i: { status: string }) => i.status === 'ACTIVE');
    if (!integration) return;

    const createdAgent = await agent()
      .post('/agents')
      .set('Cookie', cookie)
      .send({
        name: 'M5 Agent',
        integrationId: integration.id,
        modelId: 'openai/gpt-4o-mini',
        systemPrompt: 'You are a concise test assistant.',
      });

    const assistant = await agent()
      .post('/assistants')
      .set('Cookie', cookie)
      .send({
        name: 'M5 Assistant',
        agentId: createdAgent.body.id,
        welcomeMessage: 'Hello from M5',
        isActive: true,
      });

    const me = await agent().get('/auth/me').set('Cookie', cookie);
    const workspaceId = me.body.workspace.id;

    const { prisma } = await import('@botme/database');
    const widget = await prisma.widgetInstance.create({
      data: {
        workspaceId,
        assistantId: assistant.body.id,
        publicKey: `wm_m5_${Date.now()}`,
        name: 'M5 Widget',
        domains: { create: [{ domain: 'localhost' }] },
      },
    });
    widgetKey = widget.publicKey;
  }, 60_000);

async function initWidgetSession(socket: Socket, init?: { visitorId?: string; conversationId?: string }) {
  socket.emit('widget:init', init ?? {});
  return waitFor<{ session: { visitorId: string; conversationId: string } }>(socket, 'widget:session');
}

  it('initializes widget session with pinned snapshot', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1' || !widgetKey) return;

    const socket = await connectWidget(widgetKey);
    const sessionEvent = await initWidgetSession(socket);

    expect(sessionEvent.session.visitorId).toBeTruthy();
    expect(sessionEvent.session.conversationId).toBeTruthy();
    visitorId = sessionEvent.session.visitorId;
    conversationId = sessionEvent.session.conversationId;
    socket.disconnect();
  });

  it('resumes conversation on reconnect without new id', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1' || !widgetKey || !visitorId || !conversationId) return;

    const socket = await connectWidget(widgetKey);
    const sessionEvent = await initWidgetSession(socket, { visitorId, conversationId });
    expect(sessionEvent.session.conversationId).toBe(conversationId);
    socket.disconnect();
  });

  it('rejects invalid domain origin', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1' || !widgetKey) return;

    await expect(connectWidget(widgetKey, 'https://evil.example.com')).rejects.toBeDefined();
  });
});
