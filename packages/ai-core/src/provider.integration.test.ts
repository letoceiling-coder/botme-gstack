import { describe, expect, it } from 'vitest';
import { aiProviderFactory } from './factory.js';

const runLive = process.env['RUN_PROVIDER_TESTS'] === '1';

describe.runIf(runLive)('live provider APIs', () => {
  it('OpenAI validateKey', async () => {
    const key = process.env['OPENAI_API_KEY'];
    if (!key) return;
    const adapter = aiProviderFactory.create('OPENAI', { apiKey: key });
    const health = await adapter.validateKey();
    expect(health.ok).toBe(true);
    const models = await adapter.listModels();
    expect(models.length).toBeGreaterThan(0);
  });

  it('OpenRouter listModels with free tier', async () => {
    const key = process.env['OPENROUTER_API_KEY'];
    if (!key) return;
    const adapter = aiProviderFactory.create('OPENROUTER', { apiKey: key });
    const health = await adapter.validateKey();
    expect(health.ok).toBe(true);
    const models = await adapter.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.isFree)).toBe(true);
  });
});
