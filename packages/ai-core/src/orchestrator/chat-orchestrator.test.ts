import { describe, expect, it } from 'vitest';
import { buildChatMessages, mapStreamChunk } from './chat-orchestrator.js';
import type { ChatStreamChunk } from '../types.js';

describe('ChatOrchestrator helpers', () => {
  it('buildChatMessages prepends system prompt', () => {
    const messages = buildChatMessages('You are helpful.', [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
    ]);
    expect(messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    expect(messages).toHaveLength(3);
  });

  it('mapStreamChunk returns delta text', () => {
    const chunk: ChatStreamChunk = {
      id: '1',
      model: 'gpt-4o',
      delta: 'Hello',
      finishReason: null,
    };
    expect(mapStreamChunk(chunk)).toBe('Hello');
  });
});
