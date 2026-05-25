import { describe, expect, it } from 'vitest';
import { WidgetStreamRegistry } from '../application/widget-stream-registry';

describe('WidgetStreamRegistry', () => {
  it('allows only one active stream per conversation', () => {
    const registry = new WidgetStreamRegistry();
    registry.register('s1', 'conv1', 'v1', 'w1', 'sock1');
    expect(registry.hasActive('conv1')).toBe(true);
    registry.register('s2', 'conv1', 'v1', 'w1', 'sock1');
    expect(registry.getActiveStreamId('conv1')).toBe('s2');
    expect(registry.hasActive('conv1')).toBe(true);
  });

  it('cleans up on cancel and disconnect', () => {
    const registry = new WidgetStreamRegistry();
    const c1 = registry.register('s1', 'conv1', 'v1', 'w1', 'sock1');
    registry.register('s2', 'conv2', 'v1', 'w1', 'sock1');
    expect(registry.cancel('s1')).toBe(true);
    expect(c1.signal.aborted).toBe(true);
    expect(registry.cancelAllForSocket('sock1')).toBe(1);
    expect(registry.hasActive('conv2')).toBe(false);
  });
});
