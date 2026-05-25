import { Injectable } from '@nestjs/common';
import type { Namespace, Socket } from 'socket.io';
import { WS_NAMESPACES, withRealtimeMeta } from '@botme/shared';
import type { RealtimeEventMeta } from '@botme/shared';
import type { RealtimeEventEnvelope } from '@botme/realtime-runtime';
import { RealtimeRuntimeService } from './realtime-runtime.service';

@Injectable()
export class OperatorSocketBridge {
  private server: Namespace | null = null;

  attach(server: Namespace | import('socket.io').Server): void {
    this.server = server as Namespace;
  }

  emitToCallRoom<T extends Record<string, unknown>>(
    callSessionId: string,
    excludeSocketId: string | undefined,
    runtime: RealtimeRuntimeService,
    workspaceId: string,
    type: string,
    payload: T,
  ): boolean {
    if (!this.server) return false;
    const room = `call:${callSessionId}`;
    const envelope = runtime.emit({
      workspaceId,
      sessionId: callSessionId,
      sequence: 0,
      source: 'operator',
      type,
      payload,
    });
    if (!envelope) return false;
    const msg = withRealtimeMeta(payload, toMeta(envelope));
    if (excludeSocketId) {
      this.server.except(excludeSocketId).to(room).emit(type, msg);
    } else {
      this.server.to(room).emit(type, msg);
    }
    return true;
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
      source: 'widget',
      type,
      payload,
    });
    if (!envelope) return false;
    socket.emit(type, withRealtimeMeta(payload, toMeta(envelope)));
    return true;
  }

  joinCallRoom(socket: Socket, callSessionId: string): void {
    void socket.join(`call:${callSessionId}`);
  }

  emitToWorkspace<T extends Record<string, unknown>>(
    workspaceId: string,
    type: string,
    payload: T,
  ): boolean {
    if (!this.server) return false;
    this.server.to(`operator:${workspaceId}`).emit(type, payload);
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
