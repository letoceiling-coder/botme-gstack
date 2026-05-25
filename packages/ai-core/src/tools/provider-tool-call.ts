import type { AiProviderType, ChatCompletion, ChatRequest, ProviderToolDefinition } from '../types.js';
import type { BoundToolInfo } from './tool-port.js';
import { parseToolCall } from './tool-loop.helpers.js';
import type { ParsedToolCall } from './tool-loop.helpers.js';

const NATIVE_TOOL_PROVIDERS = new Set<AiProviderType>(['OPENAI', 'OPENROUTER', 'OLLAMA_NEEKLO']);

/** Providers that expose OpenAI-compatible function calling. */
export function providerSupportsNativeTools(provider: AiProviderType): boolean {
  return NATIVE_TOOL_PROVIDERS.has(provider);
}

export function toolTypeToFunctionName(type: string): string {
  return type.toLowerCase().replace(/_/g, '-');
}

export function functionNameToToolType(name: string): string {
  return name.toUpperCase().replace(/-/g, '_');
}

export function boundToolsToProviderTools(tools: BoundToolInfo[]): ProviderToolDefinition[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: toolTypeToFunctionName(t.type),
      description: t.description || t.name,
      parameters: {
        type: 'object',
        ...(t.schema && typeof t.schema === 'object' ? t.schema : { properties: {} }),
      },
    },
  }));
}

export function parseNativeToolCall(
  completion: ChatCompletion,
  boundTools: BoundToolInfo[],
): ParsedToolCall | null {
  const call = completion.toolCalls?.[0];
  if (!call?.function?.name) return null;

  const type = functionNameToToolType(call.function.name);
  if (!boundTools.some((t) => t.type === type)) return null;

  let input: Record<string, unknown> = {};
  try {
    input = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
  } catch {
    return null;
  }

  return { type, input };
}

export function withNativeTools(request: ChatRequest, tools: BoundToolInfo[]): ChatRequest {
  if (tools.length === 0) return request;
  return {
    ...request,
    tools: boundToolsToProviderTools(tools),
    toolChoice: 'auto',
  };
}

export function resolveToolCallFromCompletion(
  completion: ChatCompletion,
  boundTools: BoundToolInfo[],
): { call: ParsedToolCall | null; content: string } {
  const native = parseNativeToolCall(completion, boundTools);
  if (native) return { call: native, content: completion.content };

  const fallback = parseToolCall(completion.content);
  if (fallback && boundTools.some((t) => t.type === fallback.type)) {
    return { call: fallback, content: completion.content };
  }

  return { call: null, content: completion.content };
}

export type ToolCallingStrategy = 'native' | 'fallback';

export function resolveToolCallingStrategy(
  provider: AiProviderType,
  tools: BoundToolInfo[],
): ToolCallingStrategy {
  if (tools.length === 0) return 'fallback';
  return providerSupportsNativeTools(provider) ? 'native' : 'fallback';
}
