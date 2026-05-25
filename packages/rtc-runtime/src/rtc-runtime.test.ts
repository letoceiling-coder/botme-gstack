import { describe, expect, it } from 'vitest';
import { IceCandidateQueue } from './ice-candidate-queue.js';
import { RTCReconnectManager } from './rtc-reconnect-manager.js';
import { RTCDiagnosticsCollector } from './rtc-diagnostics-collector.js';
import { MediaTrackLifecycle } from './media-track-lifecycle.js';

describe('IceCandidateQueue', () => {
  it('buffers until remote ready', () => {
    const q = new IceCandidateQueue();
    q.pushOrBuffer({ candidate: 'a' });
    expect(q.size()).toBe(1);
    q.markRemoteReady();
    const flushed = q.flush();
    expect(flushed).toHaveLength(1);
    expect(q.size()).toBe(0);
  });
});

describe('RTCReconnectManager', () => {
  it('caps reconnect attempts', () => {
    const r = new RTCReconnectManager({ maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2 });
    expect(r.scheduleRestart(() => undefined)).toBe(true);
    expect(r.scheduleRestart(() => undefined)).toBe(true);
    expect(r.scheduleRestart(() => undefined)).toBe(false);
    r.destroy();
  });
});

describe('RTCDiagnosticsCollector', () => {
  it('recommends degrade on high packet loss', () => {
    const d = new RTCDiagnosticsCollector();
    expect(
      d.shouldDegrade({
        rttMs: 50,
        bitrateKbps: 500,
        packetLossPct: 25,
        iceState: 'connected',
        connectionState: 'connected',
        usingTurn: false,
        reconnectCount: 0,
        codec: null,
        fps: 30,
        width: 640,
        height: 480,
        capturedAt: Date.now(),
      }),
    ).toBe('reduce-video');
  });
});

describe('MediaTrackLifecycle', () => {
  it('tracks count', () => {
    const l = new MediaTrackLifecycle();
    expect(l.count()).toBe(0);
    l.stopAll();
    expect(l.count()).toBe(0);
  });
});
