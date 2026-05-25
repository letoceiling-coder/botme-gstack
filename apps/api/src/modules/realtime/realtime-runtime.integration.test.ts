import { describe, expect, it } from 'vitest';
import { EventDeduplicator, RealtimeRuntime, SocketRegistry } from '@botme/realtime-runtime';

describe('realtime-runtime integration', () => {
  it('registers socket and dedupes events', () => {
    const rt = new RealtimeRuntime();
    rt.registerSocket({
      socketId: 's1',
      workspaceId: 'w1',
      sessionId: 'v1',
      namespace: '/widget',
      connectedAt: Date.now(),
      lastHeartbeatAt: Date.now(),
    });
    expect(rt.sockets.count()).toBe(1);
    const e1 = rt.emit({
      workspaceId: 'w1',
      sessionId: 'v1',
      sequence: 0,
      source: 'widget',
      type: 'test',
      payload: {},
      eventId: 'dup',
    });
    const e2 = rt.emit({
      workspaceId: 'w1',
      sessionId: 'v1',
      sequence: 0,
      source: 'widget',
      type: 'test',
      payload: {},
      eventId: 'dup',
    });
    expect(e1).not.toBeNull();
    expect(e2).toBeNull();
  });
});

describe('SocketRegistry', () => {
  it('lists stale sockets', () => {
    const reg = new SocketRegistry({ staleAfterMs: 1000 });
    reg.register({
      socketId: 'old',
      workspaceId: 'w',
      sessionId: 's',
      namespace: '/widget',
      connectedAt: Date.now() - 5000,
      lastHeartbeatAt: Date.now() - 5000,
    });
    expect(reg.listStale().length).toBe(1);
  });
});
