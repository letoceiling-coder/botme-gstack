export interface EventDeduplicatorOptions {
  maxEntries?: number;
  ttlMs?: number;
}

/** In-memory dedupe by eventId — safe ignore on replay/reconnect. */
export class EventDeduplicator {
  private readonly seen = new Map<string, number>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(options: EventDeduplicatorOptions = {}) {
    this.maxEntries = options.maxEntries ?? 10_000;
    this.ttlMs = options.ttlMs ?? 300_000;
  }

  isDuplicate(eventId: string, now = Date.now()): boolean {
    this.prune(now);
    const ts = this.seen.get(eventId);
    if (ts != null && now - ts < this.ttlMs) return true;
    this.seen.set(eventId, now);
    if (this.seen.size > this.maxEntries) this.trimOldest();
    return false;
  }

  markSeen(eventId: string, now = Date.now()): void {
    this.seen.set(eventId, now);
    if (this.seen.size > this.maxEntries) this.trimOldest();
  }

  clear(): void {
    this.seen.clear();
  }

  size(): number {
    return this.seen.size;
  }

  private prune(now: number): void {
    for (const [id, ts] of this.seen) {
      if (now - ts >= this.ttlMs) this.seen.delete(id);
    }
  }

  private trimOldest(): void {
    const entries = [...this.seen.entries()].sort((a, b) => a[1] - b[1]);
    const remove = entries.slice(0, Math.floor(this.maxEntries * 0.1));
    for (const [id] of remove) this.seen.delete(id);
  }
}
