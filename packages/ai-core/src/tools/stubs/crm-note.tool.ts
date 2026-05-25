import type { ToolPort } from '../tool-port.js';

export const crmNoteTool: ToolPort = {
  type: 'CRM_NOTE',
  async execute(input, ctx) {
    const content = String(input['content'] ?? '').trim();
    if (!content) {
      return { ok: false, output: '', error: 'content required' };
    }
    if (content.length > 8000) {
      return { ok: false, output: '', error: 'Content too large' };
    }
    if (!ctx.persistCrmNote) {
      return { ok: false, output: '', error: 'CRM note persistence not available' };
    }
    const saved = await ctx.persistCrmNote(content);
    return {
      ok: true,
      output: 'CRM note saved',
      data: { noteId: saved.id },
    };
  },
};
