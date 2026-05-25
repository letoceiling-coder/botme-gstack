import { Injectable } from '@nestjs/common';
import type { Namespace, Socket } from 'socket.io';
import { withRealtimeMeta } from '@botme/shared';
import type { RealtimeEventMeta } from '@botme/shared';
import type { RealtimeEventEnvelope } from '@botme/realtime-runtime';
import { RealtimeRuntimeService } from './realtime-runtime.service';

/** Push events to widget sockets by socketId — used by operator gateway. */
@Injectable()
export class WidgetSocketBridge {
  private server: Namespace | null = null;

  attach(server: Namespace | import('socket.io').Server): void {
    this.server = server as Namespace;
  }

  emitToSocket<T extends Record<string, unknown>>(
    socketId: string,
    runtime: RealtimeRuntimeService,
    workspaceId: string,
    sessionId: string,
    type: string,
    payload: T,
  ): boolean {
    if (!this.server) return false;
    const socket: Socket | undefined = this.server.sockets.get(socketId);
    if (!socket) return false;
    const envelope = runtime.emit({
      workspaceId,
      sessionId,
      sequence: 0,
      source: 'operator',
      type,
      payload,
    });
    if (!envelope) return false;
    socket.emit(type, withRealtimeMeta(payload, toMeta(envelope)));
    return true;
  }
}

function toMeta(envelope: RealtimeEventEnvelope): RealtimeEventMeta {
  return {
    eventId: envelope.eventId,
    workspaceId: envelope.workspaceId,
    sessionId: envelope.sessionId,
    timestamp: envelope.timestamp,
    sequence: envelope.sequence,
    source: envelope.source,
  };
}
