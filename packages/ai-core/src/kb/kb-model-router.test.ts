import { describe, expect, it, vi } from 'vitest';
import {
  embedWithModelFallback,
  isRetryableProviderError,
  KB_EMBEDDING_MODEL_TIERS,
} from './kb-model-router.js';

describe('kb-model-router', () => {
  it('detects retryable errors', () => {
    expect(isRetryableProviderError(new Error('rate limit exceeded'))).toBe(true);
    expect(isRetryableProviderError(new Error('invalid api key'))).toBe(false);
  });

  it('falls back to second model on rate limit', async () => {
    const adapter = {
      embeddings: vi
        .fn()
        .mockRejectedValueOnce(new Error('429 rate limit'))
        .mockResolvedValueOnce({ embeddings: [[0.1, 0.2]] }),
    };
    const result = await embedWithModelFallback(adapter, ['hello'], KB_EMBEDDING_MODEL_TIERS);
    expect(result.modelId).toBe(KB_EMBEDDING_MODEL_TIERS[1]);
    expect(adapter.embeddings).toHaveBeenCalledTimes(2);
  });
});
