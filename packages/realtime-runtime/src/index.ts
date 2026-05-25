import { EventDeduplicator } from './deduplicator.js';
import { DeliveryTracker } from './delivery-tracker.js';
import { HeartbeatManager } from './heartbeat-manager.js';
import { ReconnectManager } from './reconnect-manager.js';
import { SocketRegistry } from './socket-registry.js';
import { createEnvelope, type CreateEnvelopeInput, type RealtimeEventEnvelope } from './envelope.js';

export interface RealtimeRuntimeDiagnostics {
  socketCount: number;
  dedupeCacheSize: number;
  heartbeatTracked: number;
  reconnectSessions: number;
}

/** Centralized realtime runtime — registry, dedupe, heartbeat, delivery ordering. */
export class RealtimeRuntime {
  readonly sockets = new SocketRegistry();
  readonly dedupe = new EventDeduplicator();
  readonly heartbeat = new HeartbeatManager();
  readonly delivery = new DeliveryTracker();
  readonly reconnect = new ReconnectManager();

  emit<T>(input: CreateEnvelopeInput<T>): RealtimeEventEnvelope<T> | null {
    const envelope = createEnvelope({
      ...input,
      sequence: input.sequence > 0 ? input.sequence : this.delivery.nextSequence(input.sessionId),
    });
    if (this.dedupe.isDuplicate(envelope.eventId)) return null;
    if (this.delivery.isOutOfOrder(envelope.sessionId, envelope.sequence)) return null;
    this.delivery.recordDelivery({
      eventId: envelope.eventId,
      sessionId: envelope.sessionId,
      sequence: envelope.sequence,
      deliveredAt: Date.now(),
    });
    return envelope;
  }

  registerSocket(entry: Parameters<SocketRegistry['register']>[0]): void {
    this.sockets.register(entry);
    this.heartbeat.register(entry.socketId);
    this.reconnect.touchConnected(entry.sessionId);
  }

  unregisterSocket(socketId: string): void {
    const removed = this.sockets.unregister(socketId);
    this.heartbeat.unregister(socketId);
    if (removed) this.reconnect.touchDisconnected(removed.sessionId);
  }

  touchHeartbeat(socketId: string): void {
    this.sockets.touch(socketId);
    this.heartbeat.recordPong(socketId);
  }

  getDiagnostics(): RealtimeRuntimeDiagnostics {
    return {
      socketCount: this.sockets.count(),
      dedupeCacheSize: this.dedupe.size(),
      heartbeatTracked: this.heartbeat.count(),
      reconnectSessions: 0,
    };
  }
}

export * from './envelope.js';
export * from './deduplicator.js';
export * from './socket-registry.js';
export * from './heartbeat-manager.js';
export * from './delivery-tracker.js';
export * from './reconnect-manager.js';
export * from './redis-channels.js';
export * from './stale-cleanup.js';
