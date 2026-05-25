import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyFailoverReason,
  filterToolCompatibleChain,
  isNonRetryableChatError,
  isRetryableChatError,
  sortChainCostAware,
  streamWithModelFallback,
  updateModelHealth,
} from './agent-model-router.js';
import type { AgentOrchestratorConfig, AgentModelChainEntry } from './agent-model-router.js';
import { OrchestratorError } from '../orchestrator/chat-orchestrator.js';

vi.mock('../orchestrator/chat-orchestrator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../orchestrator/chat-orchestrator.js')>();
  return {
    ...actual,
    chatOrchestrator: {
      streamCompletion: vi.fn(),
    },
  };
});

import { chatOrchestrator } from '../orchestrator/chat-orchestrator.js';

describe('agent-model-router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects retryable errors', () => {
    expect(isRetryableChatError(new Error('429 rate limit'))).toBe(true);
    expect(isNonRetryableChatError(new Error('invalid api key'))).toBe(true);
  });

  it('classifies failover reason', () => {
    expect(classifyFailoverReason(new Error('timeout'))).toBe('timeout');
    expect(classifyFailoverReason(new Error('429'))).toBe('rate_limit');
  });

  it('filters tool-incompatible models', () => {
    const chain = [
      { position: 1, integrationId: 'a', modelId: 'm1', provider: 'OPENROUTER', enabled: true, maxRetries: 1, timeoutMs: 1000, supportsTools: false },
      { position: 2, integrationId: 'a', modelId: 'm2', provider: 'OPENROUTER', enabled: true, maxRetries: 1, timeoutMs: 1000, supportsTools: true },
    ];
    expect(filterToolCompatibleChain(chain, true)).toHaveLength(1);
  });

  it('sorts free models first', () => {
    const sorted = sortChainCostAware([
      { position: 2, integrationId: 'a', modelId: 'paid', provider: 'OPENROUTER', enabled: true, maxRetries: 1, timeoutMs: 1000, isFree: false },
      { position: 1, integrationId: 'a', modelId: 'free', provider: 'OPENROUTER', enabled: true, maxRetries: 1, timeoutMs: 1000, isFree: true },
    ]);
    expect(sorted[0]!.modelId).toBe('free');
  });

  it('updates health on failure with cooldown', () => {
    let h = updateModelHealth(undefined, false);
    h = updateModelHealth(h, false);
    h = updateModelHealth(h, false);
    expect(h.consecutiveFailures).toBe(3);
    expect(h.cooldownUntil).toBeTruthy();
  });

  it('falls back to next model after retryable failure', async () => {
    const chain: AgentModelChainEntry[] = [
      { position: 0, integrationId: 'a', modelId: 'primary', provider: 'OPENROUTER', enabled: true, maxRetries: 0, timeoutMs: 5000 },
      { position: 1, integrationId: 'a', modelId: 'fallback', provider: 'OPENROUTER', enabled: true, maxRetries: 0, timeoutMs: 5000 },
    ];
    const buildConfig = (e: AgentModelChainEntry): AgentOrchestratorConfig => ({
      provider: 'OPENROUTER',
      modelId: e.modelId,
      apiKey: 'k',
      systemPrompt: 's',
      temperature: 0,
      topP: 1,
      maxTokens: 100,
    });

    vi.mocked(chatOrchestrator.streamCompletion)
      .mockImplementationOnce(async function* fail() {
        throw new OrchestratorError('429 rate limit', true);
      })
      .mockImplementationOnce(async function* ok() {
        yield { delta: 'ok', finishReason: null, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
        return { content: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, latencyMs: 10, finishReason: 'stop' };
      });

    const gen = streamWithModelFallback(chain, buildConfig, [], 'hi');
    const chunks: string[] = [];
    let result = await gen.next();
    while (!result.done) {
      if (result.value.delta) chunks.push(result.value.delta);
      result = await gen.next();
    }
    expect(result.value.modelId).toBe('fallback');
    expect(result.value.failoverFrom).toBe('primary');
    expect(chunks).toEqual(['ok']);
  });

  it('does not retry non-retryable auth errors', async () => {
    const chain: AgentModelChainEntry[] = [
      { position: 0, integrationId: 'a', modelId: 'primary', provider: 'OPENROUTER', enabled: true, maxRetries: 2, timeoutMs: 5000 },
      { position: 1, integrationId: 'a', modelId: 'fallback', provider: 'OPENROUTER', enabled: true, maxRetries: 0, timeoutMs: 5000 },
    ];
    vi.mocked(chatOrchestrator.streamCompletion).mockImplementationOnce(async function* fail() {
      throw new Error('invalid api key');
    });

    const gen = streamWithModelFallback(
      chain,
      (e) => ({
        provider: 'OPENROUTER',
        modelId: e.modelId,
        apiKey: 'k',
        systemPrompt: 's',
        temperature: 0,
        topP: 1,
        maxTokens: 100,
      }),
      [],
      'hi',
    );
    await expect(gen.next()).rejects.toThrow(/invalid api key/i);
    expect(chatOrchestrator.streamCompletion).toHaveBeenCalledTimes(1);
  });
});
