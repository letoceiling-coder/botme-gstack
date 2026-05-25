import { randomUUID } from 'node:crypto';

export type RealtimeEventSource = 'widget' | 'operator' | 'admin' | 'api' | 'system';

export interface RealtimeEventEnvelope<T = unknown> {
  eventId: string;
  workspaceId: string;
  sessionId: string;
  timestamp: string;
  sequence: number;
  source: RealtimeEventSource;
  type: string;
  payload: T;
}

export interface CreateEnvelopeInput<T> {
  workspaceId: string;
  sessionId: string;
  sequence: number;
  source: RealtimeEventSource;
  type: string;
  payload: T;
  eventId?: string;
  timestamp?: string;
}

export function createEnvelope<T>(input: CreateEnvelopeInput<T>): RealtimeEventEnvelope<T> {
  return {
    eventId: input.eventId ?? randomUUID(),
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    timestamp: input.timestamp ?? new Date().toISOString(),
    sequence: input.sequence,
    source: input.source,
    type: input.type,
    payload: input.payload,
  };
}
