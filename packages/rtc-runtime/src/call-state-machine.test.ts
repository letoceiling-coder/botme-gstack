import { describe, expect, it } from 'vitest';
import { CallStateMachine } from './call-state-machine.js';

describe('CallStateMachine', () => {
  it('starts in IDLE', () => {
    const sm = new CallStateMachine();
    expect(sm.getState()).toBe('IDLE');
  });

  it('follows accept flow transitions', () => {
    const sm = new CallStateMachine();
    expect(sm.transition('ACCEPTING')).toBe(true);
    expect(sm.transition('PERMISSION_REQUESTED')).toBe(true);
    expect(sm.transition('MEDIA_READY')).toBe(true);
    expect(sm.transition('CONNECTING')).toBe(true);
    expect(sm.transition('CONNECTED')).toBe(true);
    expect(sm.getState()).toBe('CONNECTED');
  });

  it('rejects invalid transitions', () => {
    const sm = new CallStateMachine();
    expect(sm.transition('CONNECTED')).toBe(false);
  });

  it('allows reconnect from connected', () => {
    const sm = new CallStateMachine();
    sm.transition('ACCEPTING');
    sm.transition('PERMISSION_REQUESTED');
    sm.transition('MEDIA_READY');
    sm.transition('CONNECTING');
    sm.transition('CONNECTED');
    expect(sm.transition('RECONNECTING')).toBe(true);
    expect(sm.transition('ICE_RESTART')).toBe(true);
    expect(sm.transition('CONNECTING')).toBe(true);
  });

  it('terminal states block further transitions', () => {
    const sm = new CallStateMachine();
    sm.transition('FAILED');
    expect(sm.isTerminal()).toBe(true);
    expect(sm.transition('CONNECTED')).toBe(false);
    expect(sm.transition('IDLE')).toBe(true);
  });
});
