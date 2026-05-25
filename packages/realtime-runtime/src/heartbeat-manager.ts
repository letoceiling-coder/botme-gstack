export interface HeartbeatState {
  lastPingAt: number | null;
  lastPongAt: number | null;
  missedPongs: number;
}

export interface HeartbeatManagerOptions {
  intervalMs?: number;
  timeoutMs?: number;
  maxMissed?: number;
}

/** Tracks ping/pong health per socket. */
export class HeartbeatManager {
  private readonly states = new Map<string, HeartbeatState>();
  private readonly intervalMs: number;
  private readonly timeoutMs: number;
  private readonly maxMissed: number;

  constructor(options: HeartbeatManagerOptions = {}) {
    this.intervalMs = options.intervalMs ?? 25_000;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.maxMissed = options.maxMissed ?? 2;
  }

  get interval(): number {
    return this.intervalMs;
  }

  get timeout(): number {
    return this.timeoutMs;
  }

  register(socketId: string): void {
    this.states.set(socketId, { lastPingAt: null, lastPongAt: Date.now(), missedPongs: 0 });
  }

  recordPing(socketId: string, at = Date.now()): void {
    const s = this.states.get(socketId) ?? { lastPingAt: null, lastPongAt: null, missedPongs: 0 };
    s.lastPingAt = at;
    this.states.set(socketId, s);
  }

  recordPong(socketId: string, at = Date.now()): void {
    const s = this.states.get(socketId) ?? { lastPingAt: null, lastPongAt: null, missedPongs: 0 };
    s.lastPongAt = at;
    s.missedPongs = 0;
    this.states.set(socketId, s);
  }

  isStale(socketId: string, now = Date.now()): boolean {
    const s = this.states.get(socketId);
    if (!s?.lastPongAt) return false;
    if (now - s.lastPongAt > this.timeoutMs) {
      s.missedPongs++;
      return s.missedPongs >= this.maxMissed;
    }
    return false;
  }

  unregister(socketId: string): void {
    this.states.delete(socketId);
  }

  count(): number {
    return this.states.size;
  }
}
