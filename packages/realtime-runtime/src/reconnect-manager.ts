export interface ReconnectSessionState {
  sessionId: string;
  reconnectCount: number;
  lastConnectedAt: number;
  lastDisconnectedAt: number | null;
}

/** Tracks reconnect counts per logical session (visitor / operator). */
export class ReconnectManager {
  private readonly sessions = new Map<string, ReconnectSessionState>();

  touchConnected(sessionId: string, at = Date.now()): ReconnectSessionState {
    const prev = this.sessions.get(sessionId);
    const reconnectCount = prev?.lastDisconnectedAt != null ? (prev.reconnectCount + 1) : (prev?.reconnectCount ?? 0);
    const state: ReconnectSessionState = {
      sessionId,
      reconnectCount,
      lastConnectedAt: at,
      lastDisconnectedAt: prev?.lastDisconnectedAt ?? null,
    };
    this.sessions.set(sessionId, state);
    return state;
  }

  touchDisconnected(sessionId: string, at = Date.now()): void {
    const prev = this.sessions.get(sessionId);
    this.sessions.set(sessionId, {
      sessionId,
      reconnectCount: prev?.reconnectCount ?? 0,
      lastConnectedAt: prev?.lastConnectedAt ?? at,
      lastDisconnectedAt: at,
    });
  }

  get(sessionId: string): ReconnectSessionState | undefined {
    return this.sessions.get(sessionId);
  }
}
