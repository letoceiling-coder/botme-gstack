import { describe, expect, it } from 'vitest';
import { httpTool } from '../stubs/http.tool.js';

describe('httpTool SSRF protection', () => {
  it('blocks localhost', async () => {
    const res = await httpTool.execute({ url: 'http://localhost/admin', method: 'GET' }, { workspaceId: 'ws' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/blocked/i);
  });

  it('blocks private IP', async () => {
    const res = await httpTool.execute({ url: 'http://192.168.1.1/', method: 'GET' }, { workspaceId: 'ws' });
    expect(res.ok).toBe(false);
  });
});
