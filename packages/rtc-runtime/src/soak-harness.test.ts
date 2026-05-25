import { describe, expect, it } from 'vitest';
import { CallStateMachine } from './call-state-machine.js';
import { RTCReconnectManager } from './rtc-reconnect-manager.js';

/** Soak-style lifecycle test — 100 state transitions + reconnect schedules. */
describe('RTC soak harness', () => {
  it('survives 100 call state transitions without invalid states', () => {
    const sm = new CallStateMachine();
    const path = ['ACCEPTING', 'PERMISSION_REQUESTED', 'MEDIA_READY', 'CONNECTING', 'CONNECTED', 'RECONNECTING', 'CONNECTED', 'ENDED'] as const;
    for (let i = 0; i < 100; i++) {
      for (const s of path) {
        sm.transition(s);
      }
      sm.reset();
    }
    expect(sm.getState()).toBe('IDLE');
  });

  it('caps reconnect manager at 100 schedule attempts', () => {
    const r = new RTCReconnectManager({ maxAttempts: 5, baseDelayMs: 0, maxDelayMs: 0 });
    let scheduled = 0;
    for (let i = 0; i < 100; i++) {
      if (r.scheduleRestart(() => undefined)) scheduled += 1;
    }
    expect(scheduled).toBe(5);
    r.destroy();
  });
});
