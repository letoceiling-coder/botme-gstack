/** Shared realtime envelope — every WS event SHOULD include these fields. */
export interface RealtimeEventMeta {
  eventId: string;
  workspaceId: string;
  sessionId: string;
  timestamp: string;
  sequence: number;
  source: 'widget' | 'operator' | 'admin' | 'api' | 'system';
}

export type RealtimeEnvelopePayload<T> = T & { meta?: RealtimeEventMeta };

export function withRealtimeMeta<T extends Record<string, unknown>>(
  payload: T,
  meta: RealtimeEventMeta,
): T & { meta: RealtimeEventMeta } {
  return { ...payload, meta };
}
