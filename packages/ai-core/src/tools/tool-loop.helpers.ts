const TOOL_CALL_RE = /```(?:json)?\s*(\{[\s\S]*?"tool_call"[\s\S]*?\})\s*```|(\{[\s\S]*?"tool_call"[\s\S]*?\})/;

export interface ParsedToolCall {
  type: string;
  input: Record<string, unknown>;
}

export function buildToolSystemAppendix(tools: Array<{ type: string; name: string; description: string; schema?: Record<string, unknown> }>): string {
  if (tools.length === 0) return '';
  const defs = tools.map((t) => ({
    type: t.type,
    name: t.name,
    description: t.description,
    schema: t.schema ?? {},
  }));
  return [
    '',
    '## Available tools (fallback mode)',
    'If you need to use a tool, respond ONLY with JSON:',
    '{"tool_call":{"type":"TOOL_TYPE","input":{...}}}',
    JSON.stringify(defs, null, 2),
  ].join('\n');
}

export function parseToolCall(content: string): ParsedToolCall | null {
  const trimmed = content.trim();
  const candidates: string[] = [];
  if (trimmed.startsWith('{')) candidates.push(trimmed);
  const match = TOOL_CALL_RE.exec(trimmed);
  if (match?.[1]) candidates.push(match[1]);
  if (match?.[2]) candidates.push(match[2]);

  for (const jsonStr of candidates) {
    try {
      const parsed = JSON.parse(jsonStr) as {
        tool_call?: { type?: string; input?: Record<string, unknown> };
      };
      const call = parsed.tool_call;
      if (!call?.type) continue;
      return { type: call.type.toUpperCase(), input: call.input ?? {} };
    } catch {
      continue;
    }
  }
  return null;
}

export function findBoundTool(tools: Array<{ type: string }>, type: string) {
  return tools.find((t) => t.type === type);
}
