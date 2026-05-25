import { describe, expect, it } from 'vitest';
import {
  boundToolsToProviderTools,
  functionNameToToolType,
  parseNativeToolCall,
  providerSupportsNativeTools,
  resolveToolCallFromCompletion,
  toolTypeToFunctionName,
} from './provider-tool-call.js';

describe('provider-tool-call', () => {
  const tools = [{ id: '1', name: 'Calc', description: 'math', type: 'CALCULATOR', schema: { properties: { expression: { type: 'string' } } } }];

  it('maps tool types to function names', () => {
    expect(toolTypeToFunctionName('HTTP_REQUEST')).toBe('http-request');
    expect(functionNameToToolType('lead-saver')).toBe('LEAD_SAVER');
  });

  it('detects native providers', () => {
    expect(providerSupportsNativeTools('OPENAI')).toBe(true);
    expect(providerSupportsNativeTools('OLLAMA_NEEKLO')).toBe(true);
  });

  it('builds provider tool definitions', () => {
    const defs = boundToolsToProviderTools(tools);
    expect(defs[0]?.function.name).toBe('calculator');
  });

  it('parses native tool calls', () => {
    const call = parseNativeToolCall(
      {
        id: '1',
        model: 'gpt',
        content: '',
        finishReason: 'tool_calls',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        toolCalls: [
          {
            id: 'tc1',
            type: 'function',
            function: { name: 'calculator', arguments: '{"expression":"2+2"}' },
          },
        ],
      },
      tools,
    );
    expect(call).toEqual({ type: 'CALCULATOR', input: { expression: '2+2' } });
  });

  it('falls back to JSON probe content', () => {
    const result = resolveToolCallFromCompletion(
      {
        id: '1',
        model: 'x',
        content: '{"tool_call":{"type":"CALCULATOR","input":{"expression":"3+3"}}}',
        finishReason: 'stop',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
      tools,
    );
    expect(result.call?.type).toBe('CALCULATOR');
  });
});
