import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import type { JwtPayload, RealtimeEventMeta } from '@botme/shared';
import {
  OperatorEnableCallControlsSchema,
  OperatorCallInviteSchema,
  OperatorFetchConversationSchema,
  OperatorReleaseSchema,
  OperatorSendMessageSchema,
  OperatorSubscribeSchema,
  OperatorTakeoverSchema,
  OperatorTypingSchema,
  WebRtcCallEndSchema,
  WebRtcCallJoinSchema,
  WebRtcCallRecoverSchema,
  WebRtcSignalSchema,
  WS_NAMESPACES,
  hasMinRole,
  withRealtimeMeta,
} from '@botme/shared';
import { CorsOriginsService } from '../../core/config/cors-origins.service';
import { RealtimeRuntimeService } from './services/realtime-runtime.service';
import { LiveVisitorTrackerService } from './services/live-visitor-tracker.service';
import { OperatorSessionLockService } from './services/operator-session-lock.service';
import { WebRtcSignalService } from './services/webrtc-signal.service';
import { WidgetSocketBridge } from './services/widget-socket-bridge.service';
import { OperatorSocketBridge } from './services/operator-socket-bridge.service';
import { RtcSignalRelayService } from './services/rtc-signal-relay.service';
import { ActiveCallRegistryService } from './services/active-call-registry.service';
import { RtcCallRecoveryService } from './services/rtc-call-recovery.service';
import { RtcDiagnosticsBroadcastService } from './services/rtc-diagnostics-broadcast.service';
import { OperatorChatService } from './services/operator-chat.service';
import type { RealtimeEventEnvelope } from '@botme/realtime-runtime';

type OperatorSocketData = { user: JwtPayload };

@WebSocketGateway({
  namespace: WS_NAMESPACES.operator,
  cors: {
    origin: process.env['CORS_ORIGINS']?.split(',').map((o) => o.trim()) ?? [
      'http://localhost:5173',
    ],
    credentials: true,
  },
})
export class OperatorGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(OperatorGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly corsOrigins: CorsOriginsService,
    private readonly runtime: RealtimeRuntimeService,
    private readonly visitors: LiveVisitorTrackerService,
    private readonly locks: OperatorSessionLockService,
    private readonly webrtc: WebRtcSignalService,
    private readonly widgetBridge: WidgetSocketBridge,
    private readonly operatorBridge: OperatorSocketBridge,
    private readonly signalRelay: RtcSignalRelayService,
    private readonly callRegistry: ActiveCallRegistryService,
    private readonly recovery: RtcCallRecoveryService,
    private readonly rtcBroadcast: RtcDiagnosticsBroadcastService,
    private readonly operatorChat: OperatorChatService,
  ) {}

  afterInit(server: Server): void {
    this.operatorBridge.attach(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const origin = client.handshake.headers.origin;
      if (origin && !this.corsOrigins.allowedOrigins.includes(origin)) {
        throw new UnauthorizedException('Origin not allowed');
      }
      const token = this.extractToken(client);
      if (!token) throw new UnauthorizedException();
      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.type !== 'access' || !hasMinRole(payload.role, 'MEMBER')) {
        throw new UnauthorizedException();
      }
      client.data = { user: payload } satisfies OperatorSocketData;
      await client.join(`operator:${payload.workspaceId}`);
      this.runtime.registerSocket({
        socketId: client.id,
        workspaceId: payload.workspaceId,
        sessionId: payload.sub,
        namespace: WS_NAMESPACES.operator,
        connectedAt: Date.now(),
        lastHeartbeatAt: Date.now(),
      });
      this.logger.log(`Operator connected user=${payload.sub}`);
    } catch {
      client.emit('error', { message: 'Не авторизован' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.runtime.unregisterSocket(client.id);
    void this.locks.releaseExpired();
    void this.callRegistry.cleanupStale();
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket): void {
    this.runtime.touchHeartbeat(client.id);
    client.emit('pong', { at: new Date().toISOString() });
  }

  @SubscribeMessage('operator:subscribe')
  async handleSubscribe(client: Socket): Promise<void> {
    const { user } = client.data as OperatorSocketData;
    const live = await this.visitors.listLive(user.workspaceId);
    const envelope = this.runtime.emit({
      workspaceId: user.workspaceId,
      sessionId: user.sub,
      sequence: 0,
      source: 'operator',
      type: 'operator:visitors',
      payload: { visitors: live },
    });
    if (envelope) {
      client.emit('operator:visitors', withRealtimeMeta({ visitors: live }, toMeta(envelope)));
    }
  }

  @SubscribeMessage('operator:takeover')
  async handleTakeover(client: Socket, payload: unknown): Promise<{ ok: boolean }> {
    const { user } = client.data as OperatorSocketData;
    const input = OperatorTakeoverSchema.parse(payload);
    await this.locks.acquire(user.workspaceId, input.conversationId, user.sub);
    const visitor = await this.visitors.findByConversation(user.workspaceId, input.conversationId);
    if (visitor) {
      await this.visitors.setControlMode(user.workspaceId, visitor.id, 'OPERATOR');
    }
    const envelope = this.runtime.emit({
      workspaceId: user.workspaceId,
      sessionId: input.conversationId,
      sequence: 0,
      source: 'operator',
      type: 'TAKEOVER_ENABLED',
      payload: { operatorId: user.sub, conversationId: input.conversationId },
    });
    if (envelope) {
      this.server.to(`operator:${user.workspaceId}`).emit(
        'operator:event',
        withRealtimeMeta(
          { type: 'TAKEOVER_ENABLED', conversationId: input.conversationId },
          toMeta(envelope),
        ),
      );
    }
    if (visitor?.socketId) {
      this.widgetBridge.emitToSocket(
        visitor.socketId,
        this.runtime,
        user.workspaceId,
        visitor.visitorId,
        'widget:operator-connected',
        {
          type: 'widget:operator-connected',
          conversationId: input.conversationId,
        },
      );
    }
    return { ok: true };
  }

  @SubscribeMessage('operator:release')
  async handleRelease(client: Socket, payload: unknown): Promise<{ ok: boolean }> {
    const { user } = client.data as OperatorSocketData;
    const input = OperatorReleaseSchema.parse(payload);
    await this.locks.release(user.workspaceId, input.conversationId, user.sub);
    const visitor = await this.visitors.findByConversation(user.workspaceId, input.conversationId);
    if (visitor) {
      await this.visitors.setControlMode(user.workspaceId, visitor.id, 'AI');
    }
    return { ok: true };
  }

  @SubscribeMessage('operator:enable-call-controls')
  async handleEnableCallControls(client: Socket, payload: unknown): Promise<{ ok: boolean }> {
    const { user } = client.data as OperatorSocketData;
    const input = OperatorEnableCallControlsSchema.parse(payload);
    await this.locks.acquire(user.workspaceId, input.conversationId, user.sub);
    const visitor = await this.visitors.findByConversation(user.workspaceId, input.conversationId);
    if (!visitor?.socketId) {
      client.emit('error', { message: 'Посетитель не в сети' });
      return { ok: false };
    }
    let callSessionId: string | undefined;
    if (this.webrtc.isEnabled() && (input.voiceEnabled || input.videoEnabled)) {
      const call = await this.webrtc.createCallSession(user.workspaceId, visitor.id, user.sub);
      callSessionId = call.id;
      await this.visitors.setControlMode(user.workspaceId, visitor.id, 'RTC_ACTIVE');
    }
    const pushed = this.widgetBridge.emitToSocket(
      visitor.socketId,
      this.runtime,
      user.workspaceId,
      visitor.visitorId,
      'widget:call-controls',
      {
        type: 'widget:call-controls',
        voiceEnabled: input.voiceEnabled,
        videoEnabled: input.videoEnabled,
        callSessionId,
      },
    );
    if (!pushed) {
      client.emit('error', { message: 'Не удалось доставить CALL_CONTROLS' });
      return { ok: false };
    }
    return { ok: true };
  }

  @SubscribeMessage('operator:call-invite')
  async handleCallInvite(client: Socket, payload: unknown): Promise<{ ok: boolean; callSessionId?: string }> {
    const { user } = client.data as OperatorSocketData;
    const input = OperatorCallInviteSchema.parse(payload);
    if (!this.webrtc.isEnabled()) {
      client.emit('error', { message: 'RTC feature flag disabled' });
      return { ok: false };
    }
    await this.locks.acquire(user.workspaceId, input.conversationId, user.sub);
    const visitor = await this.visitors.findByConversation(user.workspaceId, input.conversationId);
    if (!visitor?.socketId || visitor.id !== input.visitorSessionId) {
      client.emit('error', { message: 'Недопустимая visitor session' });
      return { ok: false };
    }
    const call = await this.webrtc.createCallSession(user.workspaceId, visitor.id, user.sub, input.type);
    await this.visitors.setControlMode(user.workspaceId, visitor.id, 'RTC_ACTIVE');
    this.operatorBridge.joinCallRoom(client, call.id);
    const operatorToken = this.recovery.issueToken({
      callSessionId: call.id,
      workspaceId: user.workspaceId,
      role: 'operator',
    });
    client.emit('webrtc:recovery-token', {
      callSessionId: call.id,
      recoveryToken: operatorToken,
      role: 'operator',
    });
    const visitorToken = this.recovery.issueToken({
      callSessionId: call.id,
      workspaceId: user.workspaceId,
      role: 'visitor',
    });
    this.widgetBridge.emitToSocket(
      visitor.socketId,
      this.runtime,
      user.workspaceId,
      visitor.visitorId,
      'widget:call-invite',
      {
        type: 'widget:call-invite',
        callSessionId: call.id,
        inviteType: input.type,
        recoveryToken: visitorToken,
      },
    );
    void this.rtcBroadcast.broadcastNow(user.workspaceId);
    return { ok: true, callSessionId: call.id };
  }

  @SubscribeMessage('webrtc:signal')
  async handleSignal(client: Socket, payload: unknown): Promise<{ ok: boolean; relayed?: boolean }> {
    const { user } = client.data as OperatorSocketData;
    const input = WebRtcSignalSchema.parse(payload);
    const result = await this.signalRelay.relayFromOperator({
      senderSocketId: client.id,
      workspaceId: user.workspaceId,
      operatorId: user.sub,
      signal: input,
    });
    this.rtcBroadcast.scheduleBroadcast(user.workspaceId);
    return result;
  }

  @SubscribeMessage('webrtc:call-join')
  async handleCallJoin(client: Socket, payload: unknown): Promise<{ ok: boolean }> {
    const { user } = client.data as OperatorSocketData;
    const input = WebRtcCallJoinSchema.parse(payload);
    this.operatorBridge.joinCallRoom(client, input.callSessionId);
    await this.callRegistry.bindOperatorSocket(input.callSessionId, client.id, user.sub);
    const token = this.recovery.issueToken({
      callSessionId: input.callSessionId,
      workspaceId: user.workspaceId,
      role: 'operator',
    });
    client.emit('webrtc:recovery-token', {
      callSessionId: input.callSessionId,
      recoveryToken: token,
      role: 'operator',
    });
    void this.signalRelay.replayLastAnswerToOperator({
      workspaceId: user.workspaceId,
      callSessionId: input.callSessionId,
      operatorSocketId: client.id,
    });
    return { ok: true };
  }

  @SubscribeMessage('webrtc:call-recover')
  async handleCallRecover(client: Socket, payload: unknown): Promise<{ ok: boolean; callSessionId?: string; inviteType?: string; renegotiate?: boolean }> {
    const { user } = client.data as OperatorSocketData;
    const input = WebRtcCallRecoverSchema.parse(payload);
    const result = await this.recovery.recoverParticipant({
      token: input.recoveryToken,
      role: 'operator',
      workspaceId: user.workspaceId,
      socketId: client.id,
      operatorId: user.sub,
    });
    this.operatorBridge.joinCallRoom(client, result.callSessionId);
    this.operatorBridge.emitToCallRoom(
      result.callSessionId,
      client.id,
      this.runtime,
      user.workspaceId,
      'webrtc:peer-reconnected',
      { callSessionId: result.callSessionId, role: 'operator' },
    );
    void this.rtcBroadcast.broadcastNow(user.workspaceId);
    return { ok: true, ...result };
  }

  @SubscribeMessage('webrtc:call-end')
  async handleCallEnd(client: Socket, payload: unknown): Promise<{ ok: boolean }> {
    const { user } = client.data as OperatorSocketData;
    const input = WebRtcCallEndSchema.parse(payload);
    await this.callRegistry.endCall(input.callSessionId, input.reason ?? 'ENDED');
    this.operatorBridge.emitToCallRoom(
      input.callSessionId,
      client.id,
      this.runtime,
      user.workspaceId,
      'webrtc:call-end',
      { type: 'webrtc:call-end', callSessionId: input.callSessionId, reason: input.reason ?? 'ENDED' },
    );
    void this.rtcBroadcast.broadcastNow(user.workspaceId);
    return { ok: true };
  }

  @SubscribeMessage('operator:fetch-conversation')
  async handleFetchConversation(client: Socket, payload: unknown) {
    const { user } = client.data as OperatorSocketData;
    const input = OperatorFetchConversationSchema.parse(payload);
    return this.operatorChat.fetchConversation(user.workspaceId, input.conversationId);
  }

  @SubscribeMessage('operator:send-message')
  async handleSendMessage(client: Socket, payload: unknown) {
    const { user } = client.data as OperatorSocketData;
    const input = OperatorSendMessageSchema.parse(payload);
    const message = await this.operatorChat.sendOperatorMessage(
      user.workspaceId,
      user.sub,
      input.conversationId,
      input.content,
    );
    return { ok: true, message };
  }

  @SubscribeMessage('operator:typing')
  handleOperatorTyping(client: Socket, payload: unknown): { ok: true } {
    const { user } = client.data as OperatorSocketData;
    const input = OperatorTypingSchema.parse(payload);
    this.operatorChat.emitOperatorTyping(user.workspaceId, input.conversationId, input.active);
    return { ok: true };
  }

  @SubscribeMessage('webrtc:turn-credentials')
  async handleTurnCredentials(client: Socket): Promise<void> {
    const { user } = client.data as OperatorSocketData;
    try {
      const creds = await this.webrtc.issueTurnCredentials(user.workspaceId);
      client.emit('webrtc:turn-credentials', creds ?? { disabled: true });
    } catch {
      client.emit('webrtc:turn-credentials', { disabled: true });
    }
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) return auth.token;
    const cookie = client.handshake.headers.cookie;
    if (!cookie) return undefined;
    const match = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
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
