export interface RegisteredSocket {
  socketId: string;
  workspaceId: string;
  sessionId: string;
  namespace: string;
  connectedAt: number;
  lastHeartbeatAt: number;
  metadata?: Record<string, string>;
}

export interface SocketRegistryOptions {
  staleAfterMs?: number;
}

/** Tracks active sockets for diagnostics and stale cleanup. */
export class SocketRegistry {
  private readonly sockets = new Map<string, RegisteredSocket>();
  private readonly staleAfterMs: number;

  constructor(options: SocketRegistryOptions = {}) {
    this.staleAfterMs = options.staleAfterMs ?? 90_000;
  }

  register(entry: RegisteredSocket): void {
    this.sockets.set(entry.socketId, entry);
  }

  touch(socketId: string, at = Date.now()): void {
    const s = this.sockets.get(socketId);
    if (s) s.lastHeartbeatAt = at;
  }

  unregister(socketId: string): RegisteredSocket | undefined {
    const s = this.sockets.get(socketId);
    this.sockets.delete(socketId);
    return s;
  }

  get(socketId: string): RegisteredSocket | undefined {
    return this.sockets.get(socketId);
  }

  listByWorkspace(workspaceId: string): RegisteredSocket[] {
    return [...this.sockets.values()].filter((s) => s.workspaceId === workspaceId);
  }

  listStale(now = Date.now()): RegisteredSocket[] {
    return [...this.sockets.values()].filter(
      (s) => now - s.lastHeartbeatAt > this.staleAfterMs,
    );
  }

  count(): number {
    return this.sockets.size;
  }

  countByNamespace(namespace: string): number {
    return [...this.sockets.values()].filter((s) => s.namespace === namespace).length;
  }
}
