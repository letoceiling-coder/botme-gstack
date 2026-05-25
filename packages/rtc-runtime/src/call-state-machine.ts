export type CallState =
  | 'IDLE'
  | 'INVITED'
  | 'ACCEPTING'
  | 'PERMISSION_REQUESTED'
  | 'MEDIA_READY'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ICE_RESTART'
  | 'DEGRADED'
  | 'AUDIO_ONLY'
  | 'ENDED'
  | 'FAILED';

const TERMINAL: ReadonlySet<CallState> = new Set(['ENDED', 'FAILED']);

const TRANSITIONS: Record<CallState, readonly CallState[]> = {
  IDLE: ['INVITED', 'ACCEPTING', 'MEDIA_READY', 'FAILED'],
  INVITED: ['ACCEPTING', 'MEDIA_READY', 'CONNECTING', 'ENDED', 'FAILED'],
  ACCEPTING: ['PERMISSION_REQUESTED', 'MEDIA_READY', 'CONNECTING', 'ENDED', 'FAILED'],
  PERMISSION_REQUESTED: ['MEDIA_READY', 'CONNECTING', 'FAILED', 'ENDED'],
  MEDIA_READY: ['CONNECTING', 'CONNECTED', 'FAILED', 'ENDED'],
  CONNECTING: ['CONNECTED', 'RECONNECTING', 'ICE_RESTART', 'DEGRADED', 'FAILED', 'ENDED'],
  CONNECTED: ['RECONNECTING', 'ICE_RESTART', 'DEGRADED', 'AUDIO_ONLY', 'ENDED', 'FAILED'],
  RECONNECTING: ['CONNECTED', 'CONNECTING', 'ICE_RESTART', 'FAILED', 'ENDED'],
  ICE_RESTART: ['CONNECTING', 'CONNECTED', 'RECONNECTING', 'FAILED', 'ENDED'],
  DEGRADED: ['CONNECTED', 'AUDIO_ONLY', 'RECONNECTING', 'ICE_RESTART', 'ENDED', 'FAILED'],
  AUDIO_ONLY: ['CONNECTED', 'DEGRADED', 'RECONNECTING', 'ENDED', 'FAILED'],
  ENDED: ['IDLE'],
  FAILED: ['IDLE', 'ACCEPTING'],
};

/** Single authoritative RTC call lifecycle — no scattered booleans. */
export class CallStateMachine {
  private state: CallState = 'IDLE';
  private history: Array<{ from: CallState; to: CallState; at: number }> = [];

  getState(): CallState {
    return this.state;
  }

  isTerminal(): boolean {
    return TERMINAL.has(this.state);
  }

  canTransition(to: CallState): boolean {
    if (this.state === to) return true;
    return TRANSITIONS[this.state].includes(to);
  }

  transition(to: CallState): boolean {
    if (this.state === to) return true;
    if (!this.canTransition(to)) return false;
    this.history.push({ from: this.state, to, at: Date.now() });
    this.state = to;
    return true;
  }

  reset(): void {
    this.state = 'IDLE';
    this.history = [];
  }

  getHistory(): ReadonlyArray<{ from: CallState; to: CallState; at: number }> {
    return this.history;
  }
}
