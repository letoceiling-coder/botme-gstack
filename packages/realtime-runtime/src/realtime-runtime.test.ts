import { describe, expect, it } from 'vitest';
import { EventDeduplicator, RealtimeRuntime } from './index.js';

describe('EventDeduplicator', () => {
  it('ignores duplicate eventId', () => {
    const d = new EventDeduplicator();
    expect(d.isDuplicate('e1')).toBe(false);
    expect(d.isDuplicate('e1')).toBe(true);
  });
});

describe('RealtimeRuntime', () => {
  it('assigns monotonic sequence per session', () => {
    const rt = new RealtimeRuntime();
    const a = rt.emit({
      workspaceId: 'w1',
      sessionId: 's1',
      sequence: 0,
      source: 'widget',
      type: 'test',
      payload: { x: 1 },
    });
    const b = rt.emit({
      workspaceId: 'w1',
      sessionId: 's1',
      sequence: 0,
      source: 'widget',
      type: 'test',
      payload: { x: 2 },
    });
    expect(a!.sequence).toBe(1);
    expect(b!.sequence).toBe(2);
  });

  it('dedupes by eventId', () => {
    const rt = new RealtimeRuntime();
    const first = rt.emit({
      workspaceId: 'w1',
      sessionId: 's1',
      sequence: 0,
      source: 'widget',
      type: 'test',
      payload: {},
      eventId: 'fixed-id',
    });
    const second = rt.emit({
      workspaceId: 'w1',
      sessionId: 's1',
      sequence: 0,
      source: 'widget',
      type: 'test',
      payload: {},
      eventId: 'fixed-id',
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });
});
