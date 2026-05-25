import { describe, expect, it } from 'vitest';
import { StreamRegistry } from '../application/stream-registry';

describe('StreamRegistry', () => {
  it('aborts and removes stream on cancel', () => {
    const registry = new StreamRegistry();
    const controller = registry.register('s1', 'sess1', 'u1', 'ws1');
    expect(registry.cancel('s1')).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(registry.get('s1')).toBeUndefined();
  });

  it('cancelBySession aborts all matching streams', () => {
    const registry = new StreamRegistry();
    registry.register('s1', 'sess1', 'u1', 'ws1');
    registry.register('s2', 'sess1', 'u1', 'ws1');
    registry.register('s3', 'sess2', 'u1', 'ws1');
    expect(registry.cancelBySession('sess1')).toBe(2);
    expect(registry.get('s3')).toBeDefined();
  });
});
