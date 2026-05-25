import { describe, expect, it } from 'vitest';
import { aiProviderFactory } from './factory.js';
import { UnsupportedProviderError } from './errors.js';
import { normalizeOpenRouterModels } from './normalizers.js';

describe('AiProviderFactory', () => {
  it('creates OpenAI adapter', () => {
    const adapter = aiProviderFactory.create('OPENAI', { apiKey: 'sk-test' });
    expect(adapter.provider).toBe('OPENAI');
  });

  it('creates OpenRouter adapter', () => {
    const adapter = aiProviderFactory.create('OPENROUTER', { apiKey: 'sk-or-test' });
    expect(adapter.provider).toBe('OPENROUTER');
  });

  it('throws for unsupported providers', () => {
    expect(() => aiProviderFactory.create('ANTHROPIC', { apiKey: 'x' })).toThrow(
      UnsupportedProviderError,
    );
  });
});

describe('normalizeOpenRouterModels', () => {
  it('detects free models from pricing and id', () => {
    const models = normalizeOpenRouterModels({
      data: [
        {
          id: 'google/gemini-2.0-flash-exp:free',
          name: 'Gemini Free',
          context_length: 1000000,
          pricing: { prompt: '0', completion: '0' },
          architecture: { modality: 'text+image->text' },
        },
        {
          id: 'openai/gpt-4o',
          name: 'GPT-4o',
          context_length: 128000,
          pricing: { prompt: '0.0000025', completion: '0.00001' },
          architecture: { modality: 'text+image->text' },
        },
      ],
    });

    expect(models[0]?.isFree).toBe(true);
    expect(models[1]?.isFree).toBe(false);
    expect(models[0]?.contextWindow).toBe(1000000);
    expect(models[0]?.supportsVision).toBe(true);
  });
});
