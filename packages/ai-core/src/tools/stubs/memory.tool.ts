import type { ToolPort } from '../tool-port.js';

export const memoryTool: ToolPort = {
  type: 'MEMORY',
  async execute(input, ctx) {
    const action = String(input['action'] ?? 'get').toLowerCase();
    const key = String(input['key'] ?? '').trim();
    if (!key || key.length > 120) {
      return { ok: false, output: '', error: 'Invalid key' };
    }
    if (!ctx.memoryStore) {
      return { ok: false, output: '', error: 'Memory store not available' };
    }

    if (action === 'set') {
      const value = String(input['value'] ?? '');
      if (value.length > 4000) {
        return { ok: false, output: '', error: 'Value too large' };
      }
      await ctx.memoryStore.set(key, value);
      return { ok: true, output: 'Saved', data: { key, action: 'set' } };
    }

    if (action === 'delete') {
      await ctx.memoryStore.delete(key);
      return { ok: true, output: 'Deleted', data: { key, action: 'delete' } };
    }

    const value = await ctx.memoryStore.get(key);
    return {
      ok: true,
      output: value ?? '',
      data: { key, action: 'get', found: value !== null },
    };
  },
};
