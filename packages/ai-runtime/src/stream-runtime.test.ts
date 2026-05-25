import { describe, expect, it, vi } from 'vitest';
import { StreamRuntime, consumeStream } from './index.js';

describe('StreamRuntime', () => {
  it('resets content on failover reset', () => {
    const onReset = vi.fn();
    const rt = new StreamRuntime({ streamId: 's1', callbacks: { onReset } });
    rt.pushChunk('partial');
    expect(rt.contentSnapshot).toBe('partial');
    rt.reset();
    expect(rt.contentSnapshot).toBe('');
    expect(onReset).toHaveBeenCalledOnce();
    expect(rt.metrics.resetCount).toBe(1);
  });

  it('recordFailover clears ghost chunks', () => {
    const chunks: string[] = [];
    const rt = new StreamRuntime({
      streamId: 's1',
      callbacks: { onChunk: (d) => chunks.push(d), onReset: () => {} },
    });
    rt.pushChunk('ghost');
    rt.recordFailover('m1', 'm2');
    rt.pushChunk('ok');
    expect(chunks).toEqual(['ghost', 'ok']);
    expect(rt.metrics.failoverCount).toBe(1);
    expect(rt.contentSnapshot).toBe('ok');
  });
});

describe('consumeStream', () => {
  it('consumes generator to completion', async () => {
    const rt = new StreamRuntime({ streamId: 's1' });
    async function* gen() {
      yield { delta: 'hi' };
      return { content: 'hi', modelId: 'm1' };
    }
    const done = await consumeStream(rt, gen(), (v) => v.content, (v) => ({ modelId: v.modelId }));
    expect(done.content).toBe('hi');
    expect(rt.metrics.modelId).toBe('m1');
  });
});
