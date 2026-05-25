import type { ToolPort } from '../tool-port.js';

export const ragSearchTool: ToolPort = {
  type: 'RAG_SEARCH',
  async execute(input, ctx) {
    const query = String(input['query'] ?? '').trim();
    if (!query) {
      return { ok: false, output: '', error: 'query required' };
    }
    if (!ctx.ragRetrieve) {
      return { ok: false, output: '', error: 'RAG not configured for this context' };
    }
    try {
      const result = await ctx.ragRetrieve(query);
      return {
        ok: true,
        output: result.output,
        data: { citationCount: result.citations?.length ?? 0 },
      };
    } catch (err: unknown) {
      return { ok: false, output: '', error: err instanceof Error ? err.message : 'RAG failed' };
    }
  },
};
