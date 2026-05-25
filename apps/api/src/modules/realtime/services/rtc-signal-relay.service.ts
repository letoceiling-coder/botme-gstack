import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { withRealtimeMeta } from '@botme/shared';
import type { RealtimeEventMeta } from '@botme/shared';
import type { RealtimeEventEnvelope } from '@botme/realtime-runtime';
import { RealtimeRuntimeService } from './realtime-runtime.service';
import { WebRtcSignalService } from './webrtc-signal.service';
import { ActiveCallRegistryService } from './active-call-registry.service';
import { OperatorSocketBridge } from './operator-socket-bridge.service';
import { WidgetSocketBridge } from './widget-socket-bridge.service';
import { RtcRedisStoreService } from './rtc-redis-store.service';

export interface RelaySignalInput {
  callSessionId: string;
  signalId?: string;
  type: 'offer' | 'answer' | 'ice' | 'restart';
  sdp?: string;
  candidate?: unknown;
}

/** Bidirectional WebRTC signaling relay with Redis dedupe + replay protection. */
@Injectable()
export class RtcSignalRelayService {
  private readonly logger = new Logger(RtcSignalRelayService.name);

  constructor(
    private readonly runtime: RealtimeRuntimeService,
    private readonly webrtc: WebRtcSignalService,
    private readonly registry: ActiveCallRegistryService,
    private readonly widgetBridge: WidgetSocketBridge,
    private readonly operatorBridge: OperatorSocketBridge,
    private readonly redisStore: RtcRedisStoreService,
  ) {}

  async relayFromOperator(params: {
    senderSocketId: string;
    workspaceId: string;
    operatorId: string;
    signal: RelaySignalInput;
  }): Promise<{ ok: boolean; relayed: boolean }> {
    if (!this.webrtc.isEnabled()) {
      throw new ForbiddenException('RTC отключён');
    }

    await this.webrtc.validateSignal({
      workspaceId: params.workspaceId,
      operatorId: params.operatorId,
      callSessionId: params.signal.callSessionId,
      type: params.signal.type,
      sdp: params.signal.sdp,
      candidate: params.signal.candidate,
    });

    const call = await this.webrtc.getCallSession(params.workspaceId, params.signal.callSessionId);
    if (!call) throw new ForbiddenException('Call session не найдена');

    await this.registry.bindOperatorSocket(params.signal.callSessionId, params.senderSocketId, params.operatorId);

    const signalId = params.signal.signalId ?? randomUUID();
    if (!(await this.markSignalSeen(params.signal.callSessionId, signalId))) {
      return { ok: true, relayed: false };
    }

    const sequence = await this.registry.nextSignalSequence(params.signal.callSessionId);
    const payload = {
      type: 'webrtc:signal' as const,
      callSessionId: params.signal.callSessionId,
      signalId,
      signalType: params.signal.type,
      sdp: params.signal.sdp,
      candidate: params.signal.candidate,
      from: 'operator' as const,
    };

    const envelope = this.runtime.emit({
      workspaceId: params.workspaceId,
      sessionId: params.signal.callSessionId,
      sequence,
      source: 'operator',
      type: 'webrtc:signal',
      payload,
    });
    if (!envelope) return { ok: true, relayed: false };

    await this.registry.touchSignal(params.signal.callSessionId);
    if (params.signal.type === 'answer' || params.signal.type === 'offer') {
      await this.registry.markActive(params.signal.callSessionId);
    }
    if (
      (params.signal.type === 'offer' || params.signal.type === 'restart') &&
      params.signal.sdp
    ) {
      await this.redisStore.saveLastOffer(params.signal.callSessionId, params.signal.sdp);
    }

    const reg = await this.registry.get(params.signal.callSessionId);
    const visitorSocketId = call.visitorSession?.socketId ?? reg?.visitorSocketId;
    if (!visitorSocketId) {
      this.logger.warn(`No visitor socket for call=${params.signal.callSessionId}`);
      return { ok: true, relayed: false };
    }

    const relayed = this.emitToWidget(visitorSocketId, params.workspaceId, params.signal.callSessionId, payload, envelope);
    return { ok: true, relayed };
  }

  /** Re-send the last stored operator offer after visitor accepts (offer may have arrived early). */
  async replayLastOfferToVisitor(params: {
    workspaceId: string;
    callSessionId: string;
    visitorSocketId: string;
  }): Promise<boolean> {
    const sdp = await this.redisStore.getLastOffer(params.callSessionId);
    if (!sdp) return false;

    const signalId = randomUUID();
    const sequence = await this.registry.nextSignalSequence(params.callSessionId);
    const payload = {
      type: 'webrtc:signal' as const,
      callSessionId: params.callSessionId,
      signalId,
      signalType: 'offer' as const,
      sdp,
      from: 'operator' as const,
    };
    const envelope = this.runtime.emit({
      workspaceId: params.workspaceId,
      sessionId: params.callSessionId,
      sequence,
      source: 'operator',
      type: 'webrtc:signal',
      payload,
    });
    if (!envelope) return false;

    const relayed = this.emitToWidget(
      params.visitorSocketId,
      params.workspaceId,
      params.callSessionId,
      payload,
      envelope,
    );
    if (relayed) {
      this.logger.log(`Replayed stored offer call=${params.callSessionId} to visitor`);
    }
    return relayed;
  }

  /** Re-send stored visitor answer after operator joins call room (answer may have arrived early). */
  async replayLastAnswerToOperator(params: {
    workspaceId: string;
    callSessionId: string;
    operatorSocketId: string;
  }): Promise<boolean> {
    const sdp = await this.redisStore.getLastAnswer(params.callSessionId);
    if (!sdp) return false;

    const signalId = randomUUID();
    const sequence = await this.registry.nextSignalSequence(params.callSessionId);
    const payload = {
      type: 'webrtc:signal' as const,
      callSessionId: params.callSessionId,
      signalId,
      signalType: 'answer' as const,
      sdp,
      from: 'visitor' as const,
    };
    const envelope = this.runtime.emit({
      workspaceId: params.workspaceId,
      sessionId: params.callSessionId,
      sequence,
      source: 'widget',
      type: 'webrtc:signal',
      payload,
    });
    if (!envelope) return false;

    const relayed = this.operatorBridge.emitToSocket(
      params.operatorSocketId,
      this.runtime,
      params.workspaceId,
      params.callSessionId,
      'webrtc:signal',
      withRealtimeMeta(payload, toMeta(envelope)),
    );
    if (relayed) {
      this.logger.log(`Replayed stored answer call=${params.callSessionId} to operator`);
    }
    return relayed;
  }

  async relayFromVisitor(params: {
    senderSocketId: string;
    workspaceId: string;
    signal: RelaySignalInput;
  }): Promise<{ ok: boolean; relayed: boolean }> {
    if (!this.webrtc.isEnabled()) {
      throw new ForbiddenException('RTC отключён');
    }

    const call = await this.webrtc.getCallSession(params.workspaceId, params.signal.callSessionId);
    if (!call) {
      throw new ForbiddenException('Call session не найдена');
    }
    const reg = await this.registry.get(params.signal.callSessionId);
    const visitorSocketId = call.visitorSession?.socketId ?? reg?.visitorSocketId;
    if (visitorSocketId !== params.senderSocketId) {
      throw new ForbiddenException('Call session недействительна для visitor');
    }

    await this.webrtc.validateSignal({
      workspaceId: params.workspaceId,
      callSessionId: params.signal.callSessionId,
      type: params.signal.type,
      sdp: params.signal.sdp,
      candidate: params.signal.candidate,
    });

    await this.registry.bindVisitorSocket(params.signal.callSessionId, params.senderSocketId);

    const signalId = params.signal.signalId ?? randomUUID();
    if (!(await this.markSignalSeen(params.signal.callSessionId, signalId))) {
      return { ok: true, relayed: false };
    }

    const sequence = await this.registry.nextSignalSequence(params.signal.callSessionId);
    const payload = {
      type: 'webrtc:signal' as const,
      callSessionId: params.signal.callSessionId,
      signalId,
      signalType: params.signal.type,
      sdp: params.signal.sdp,
      candidate: params.signal.candidate,
      from: 'visitor' as const,
    };

    const envelope = this.runtime.emit({
      workspaceId: params.workspaceId,
      sessionId: params.signal.callSessionId,
      sequence,
      source: 'widget',
      type: 'webrtc:signal',
      payload,
    });
    if (!envelope) return { ok: true, relayed: false };

    await this.registry.touchSignal(params.signal.callSessionId);
    if (params.signal.type === 'answer' || params.signal.type === 'offer') {
      await this.registry.markActive(params.signal.callSessionId);
    }
    if (params.signal.type === 'answer' && params.signal.sdp) {
      await this.redisStore.saveLastAnswer(params.signal.callSessionId, params.signal.sdp);
    }

    const relayed = this.operatorBridge.emitToCallRoom(
      params.signal.callSessionId,
      params.senderSocketId,
      this.runtime,
      params.workspaceId,
      'webrtc:signal',
      withRealtimeMeta(payload, toMeta(envelope)),
    );
    return { ok: true, relayed };
  }

  private emitToWidget(
    socketId: string,
    workspaceId: string,
    sessionId: string,
    payload: Record<string, unknown>,
    envelope: RealtimeEventEnvelope,
  ): boolean {
    return this.widgetBridge.emitToSocket(
      socketId,
      this.runtime,
      workspaceId,
      sessionId,
      'webrtc:signal',
      withRealtimeMeta(payload, toMeta(envelope)),
    );
  }

  private async markSignalSeen(callSessionId: string, signalId: string): Promise<boolean> {
    return this.redisStore.markSignalSeen(callSessionId, signalId);
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
