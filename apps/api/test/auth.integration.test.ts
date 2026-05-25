import { config } from 'dotenv';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';

config({ path: resolve(__dirname, '../../../.env'), override: true });

const port = Number(process.env['API_PORT'] ?? 3010) || 3010;
const API = `http://127.0.0.1:${port}`;
const agent = () => request(API);

describe('auth integration (live API)', () => {
  it('registers, persists session, refreshes, logs out', async () => {
    if (process.env['RUN_INTEGRATION'] !== '1') {
      return;
    }

    const email = `audit-${Date.now()}@botme.test`;

    const register = await agent()
      .post('/auth/register')
      .send({
        email,
        password: 'password123',
        name: 'Audit User',
        workspaceName: 'Audit WS',
      })
      .expect(201);

    expect(register.body.user.email).toBe(email);
    const cookies = register.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : String(cookies);

    const me = await agent().get('/auth/me').set('Cookie', cookieHeader).expect(200);
    expect(me.body.user.email).toBe(email);

    const refresh = await agent().post('/auth/refresh').set('Cookie', cookieHeader).expect(200);
    const newCookies = refresh.headers['set-cookie'];
    const newCookieHeader = Array.isArray(newCookies) ? newCookies.join('; ') : String(newCookies);

    await agent().post('/auth/logout').set('Cookie', newCookieHeader).expect(200);
    await agent().get('/auth/me').expect(401);
  });
});
