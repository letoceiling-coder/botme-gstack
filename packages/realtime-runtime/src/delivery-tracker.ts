export interface DeliveryRecord {
  eventId: string;
  sessionId: string;
  sequence: number;
  deliveredAt: number;
}

/** Per-session ordered delivery + last sequence for replay protection. */
export class DeliveryTracker {
  private readonly lastSequence = new Map<string, number>();
  private readonly recent = new Map<string, DeliveryRecord[]>();
  private readonly maxRecentPerSession: number;

  constructor(maxRecentPerSession = 200) {
    this.maxRecentPerSession = maxRecentPerSession;
  }

  nextSequence(sessionId: string): number {
    return (this.lastSequence.get(sessionId) ?? 0) + 1;
  }

  getLastSequence(sessionId: string): number {
    return this.lastSequence.get(sessionId) ?? 0;
  }

  recordDelivery(record: DeliveryRecord): void {
    const list = this.recent.get(record.sessionId) ?? [];
    list.push(record);
    if (list.length > this.maxRecentPerSession) list.shift();
    this.recent.set(record.sessionId, list);
    if (record.sequence > (this.lastSequence.get(record.sessionId) ?? 0)) {
      this.lastSequence.set(record.sessionId, record.sequence);
    }
  }

  isOutOfOrder(sessionId: string, sequence: number): boolean {
    const last = this.lastSequence.get(sessionId) ?? 0;
    return sequence <= last;
  }

  clearSession(sessionId: string): void {
    this.lastSequence.delete(sessionId);
    this.recent.delete(sessionId);
  }
}
