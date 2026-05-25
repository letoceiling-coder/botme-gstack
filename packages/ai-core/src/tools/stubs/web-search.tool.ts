import type { ToolPort } from '../tool-port.js';

export const webSearchTool: ToolPort = {
  type: 'WEB_SEARCH',
  async execute(input) {
    const query = String(input['query'] ?? '').trim();
    if (!query) {
      return { ok: false, output: '', error: 'query required' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        return { ok: false, output: '', error: `Search HTTP ${res.status}` };
      }
      const data = (await res.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        RelatedTopics?: Array<{ Text?: string }>;
      };
      const parts: string[] = [];
      if (data.AbstractText) {
        parts.push(data.AbstractText);
        if (data.AbstractURL) parts.push(`Source: ${data.AbstractURL}`);
      }
      const related = (data.RelatedTopics ?? [])
        .slice(0, 5)
        .map((t) => t.Text)
        .filter(Boolean);
      if (related.length) parts.push(`Related: ${related.join('; ')}`);
      const output = parts.join('\n\n') || 'No results found';
      return { ok: true, output: output.slice(0, 16_000), data: { query } };
    } catch (err: unknown) {
      return { ok: false, output: '', error: err instanceof Error ? err.message : 'Search failed' };
    } finally {
      clearTimeout(timer);
    }
  },
};
