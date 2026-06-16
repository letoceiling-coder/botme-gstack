import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  VisitorHeartbeatSchema,
  WidgetCancelSchema,
  WidgetCallAcceptSchema,
  WidgetInitSchema,
  WidgetMessageSchema,
  WidgetVisitorTypingSchema,
  WebRtcCallEndSchema,
  WebRtcCallJoinSchema,
  WebRtcCallRecoverSchema,
  WebRtcSignalSchema,
  WS_NAMESPACES,
  withRealtimeMeta,
} from '@botme/shared';
import type { RealtimeEventMeta } from '@botme/shared';
import { WidgetAuthService } from '../foundation/application/widget-auth.service';
import type { WidgetSessionContext } from '../foundation/application/widget-auth.service';
import { WidgetChatService } from '../widget-chat/application/widget-chat.service';
import { RealtimeRuntimeService } from './services/realtime-runtime.service';
import { LiveVisitorTrackerService } from './services/live-visitor-tracker.service';
import { WidgetSocketBridge } from './services/widget-socket-bridge.service';
import { OperatorSocketBridge } from './services/operator-socket-bridge.service';
import { WebRtcSignalService } from './services/webrtc-signal.service';
import { RtcSignalRelayService } from './services/rtc-signal-relay.service';
import { ActiveCallRegistryService } from './services/active-call-registry.service';
import { RtcCallRecoveryService } from './services/rtc-call-recovery.service';
import { RtcDiagnosticsBroadcastService } from './services/rtc-diagnostics-broadcast.service';
import { OperatorChatService } from './services/operator-chat.service';
import { ChatRealtimeBroadcastService } from './services/chat-realtime-broadcast.service';
import type { RealtimeEventEnvelope } from '@botme/realtime-runtime';

type WidgetSocketData = WidgetSessionContext & { visitorId?: string };

@WebSocketGateway({
  namespace: WS_NAMESPACES.widget,
  cors: {
    origin: process.env['CORS_ORIGINS']?.split(',').map((o) => o.trim()) ?? [
      'http://localhost:5173',
      'http://localhost:5174',
    ],
    credentials: true,
  },
})
export class WidgetGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(WidgetGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly widgetAuth: WidgetAuthService,
    private readonly chat: WidgetChatService,
    private readonly runtime: RealtimeRuntimeService,
    private readonly visitors: LiveVisitorTrackerService,
    private readonly bridge: WidgetSocketBridge,
    private readonly operatorBridge: OperatorSocketBridge,
    private readonly webrtc: WebRtcSignalService,
    private readonly signalRelay: RtcSignalRelayService,
    private readonly callRegistry: ActiveCallRegistryService,
    private readonly recovery: RtcCallRecoveryService,
    private readonly rtcBroadcast: RtcDiagnosticsBroadcastService,
    private readonly operatorChat: OperatorChatService,
    private readonly chatBroadcast: ChatRealtimeBroadcastService,
  ) {}

  afterInit(server: Server): void {
    this.bridge.attach(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    const widgetKey = (client.handshake.query['widgetKey'] as string | undefined)?.trim();
    const previewToken = (client.handshake.query['previewToken'] as string | undefined)?.trim();
    const origin = client.handshake.headers.origin;
    const referer = client.handshake.headers.referer;

    try {
      const session = await this.widgetAuth.authenticate(widgetKey ?? '', origin, {
        previewToken: previewToken || undefined,
        referer: typeof referer === 'string' ? referer : undefined,
      });
      client.data = session satisfies WidgetSocketData;
      await client.join(`widget:${session.publicKey}`);
      this.runtime.registerSocket({
        socketId: client.id,
        workspaceId: session.workspaceId,
        sessionId: session.widgetId,
        namespace: WS_NAMESPACES.widget,
        connectedAt: Date.now(),
        lastHeartbeatAt: Date.now(),
        metadata: { publicKey: session.publicKey },
      });
      this.logger.log(`Widget connected key=${session.publicKey}`);
      client.emit('ready', { message: 'Подключено' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка авторизации виджета';
      client.emit('error', { message });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const ctx = client.data as WidgetSocketData | undefined;
    const cancelled = this.chat.cancelForDisconnect(client.id);
    if (cancelled > 0) {
      this.logger.log(`Widget disconnect cancelled ${cancelled} stream(s) socket=${client.id}`);
    }
    this.runtime.unregisterSocket(client.id);
    if (ctx?.visitorId && ctx.workspaceId) {
      void this.visitors
        .markDisconnected(ctx.workspaceId, ctx.widgetId, ctx.visitorId)
        .then(() => this.chatBroadcast.refreshVisitorList(ctx.workspaceId))
        .catch(() => undefined);
    }
    void this.callRegistry.cleanupStale();
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket): void {
    this.runtime.touchHeartbeat(client.id);
    client.emit('pong', { at: new Date().toISOString() });
  }

  @SubscribeMessage('widget:heartbeat')
  async handleHeartbeat(client: Socket, payload: unknown): Promise<void> {
    const ctx = client.data as WidgetSocketData;
    const input = VisitorHeartbeatSchema.parse(payload);
    ctx.visitorId = input.visitorId;
    await this.visitors.heartbeat({
      workspaceId: ctx.workspaceId,
      widgetId: ctx.widgetId,
      visitorId: input.visitorId,
      socketId: client.id,
      currentPage: input.currentPage,
      tabVisible: input.tabVisible,
    });
    this.scheduleVisitorListRefresh(ctx.workspaceId);
  }

  private visitorListTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private scheduleVisitorListRefresh(workspaceId: string): void {
    if (this.visitorListTimers.has(workspaceId)) return;
    const timer = setTimeout(() => {
      this.visitorListTimers.delete(workspaceId);
      void this.chatBroadcast.refreshVisitorList(workspaceId);
    }, 2000);
    this.visitorListTimers.set(workspaceId, timer);
  }

  private emitWidget<T extends Record<string, unknown>>(
    client: Socket,
    ctx: WidgetSessionContext,
    sessionId: string,
    type: string,
    payload: T,
  ): void {
    const envelope = this.runtime.emit({
      workspaceId: ctx.workspaceId,
      sessionId,
      sequence: 0,
      source: 'widget',
      type,
      payload,
    });
    if (!envelope) return;
    client.emit(type, withRealtimeMeta(payload, toMeta(envelope)));
  }

  @SubscribeMessage('widget:init')
  async handleInit(client: Socket, payload: unknown): Promise<void> {
    const ctx = client.data as WidgetSocketData;
    try {
      const input = WidgetInitSchema.parse(payload ?? {});
      const session = await this.chat.initSession(ctx, input);
      (client.data as WidgetSocketData).visitorId = session.visitorId;
      await this.visitors.upsertConnected({
        workspaceId: ctx.workspaceId,
        widgetId: ctx.widgetId,
        visitorId: session.visitorId,
        conversationId: session.conversationId,
        socketId: client.id,
        reconnect: !!input.visitorId,
      });
      this.emitWidget(client, ctx, session.visitorId, 'widget:session', {
        type: 'widget:session',
        session,
      });
      void this.chatBroadcast.refreshVisitorList(ctx.workspaceId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Не удалось инициализировать сессию';
      client.emit('widget:error', {
        type: 'widget:error',
        conversationId: '',
        streamId: '',
        message,
        retryable: false,
      });
    }
  }

  @SubscribeMessage('widget:message')
  async handleMessage(client: Socket, payload: unknown): Promise<void> {
    const ctx = client.data as WidgetSessionContext;
    const input = WidgetMessageSchema.parse(payload);

    try {
      await this.chat.startMessage(ctx, input.conversationId, input.content, client.id, {
        onUserMessage: (message) => {
          client.emit('widget:message-ack', {
            type: 'widget:message-ack',
            conversationId: input.conversationId,
            message,
          });
          this.operatorChat.broadcastNewMessage(ctx.workspaceId, input.conversationId, message);
        },
        onAssistantMessage: (message) => {
          this.operatorChat.broadcastNewMessage(ctx.workspaceId, input.conversationId, message);
        },
        onStarted: (streamId) => {
          this.emitWidget(client, ctx, input.conversationId, 'widget:started', {
            type: 'widget:started',
            conversationId: input.conversationId,
            streamId,
          });
        },
        onChunk: (delta, streamId) => {
          this.emitWidget(client, ctx, input.conversationId, 'widget:chunk', {
            type: 'widget:chunk',
            conversationId: input.conversationId,
            streamId,
            delta,
          });
        },
        onStreamReset: (streamId) => {
          this.emitWidget(client, ctx, input.conversationId, 'widget:stream-reset', {
            type: 'widget:stream-reset',
            conversationId: input.conversationId,
            streamId,
          });
        },
        onTyping: (active) => {
          this.emitWidget(client, ctx, input.conversationId, 'widget:typing', {
            type: 'widget:typing',
            conversationId: input.conversationId,
            active,
          });
        },
        onDone: ({ streamId, messageId, content, usage }) => {
          this.emitWidget(client, ctx, input.conversationId, 'widget:done', {
            type: 'widget:done',
            conversationId: input.conversationId,
            streamId,
            messageId,
            content,
            usage,
          });
        },
        onError: ({ streamId, message, retryable }) => {
          client.emit('widget:error', {
            type: 'widget:error',
            conversationId: input.conversationId,
            streamId,
            message,
            retryable,
          });
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Не удалось отправить сообщение';
      client.emit('widget:error', {
        type: 'widget:error',
        conversationId: input.conversationId,
        streamId: '',
        message,
        retryable: false,
      });
    }
  }

  @SubscribeMessage('widget:cancel')
  handleCancel(client: Socket, payload: unknown): { ok: boolean } {
    const input = WidgetCancelSchema.parse(payload);
    const ok = this.chat.cancelStream(input.conversationId, input.streamId);
    return { ok };
  }

  @SubscribeMessage('widget:visitor-typing')
  handleVisitorTyping(client: Socket, payload: unknown): { ok: true } {
    const ctx = client.data as WidgetSocketData;
    const input = WidgetVisitorTypingSchema.parse(payload);
    this.operatorChat.emitVisitorTyping(ctx.workspaceId, input.conversationId, input.active);
    return { ok: true };
  }

  @SubscribeMessage('webrtc:signal')
  async handleSignal(client: Socket, payload: unknown): Promise<{ ok: boolean; relayed?: boolean }> {
    const ctx = client.data as WidgetSocketData;
    const input = WebRtcSignalSchema.parse(payload);
    const result = await this.signalRelay.relayFromVisitor({
      senderSocketId: client.id,
      workspaceId: ctx.workspaceId,
      signal: input,
    });
    this.rtcBroadcast.scheduleBroadcast(ctx.workspaceId);
    return result;
  }

  @SubscribeMessage('webrtc:call-join')
  async handleCallJoin(client: Socket, payload: unknown): Promise<{ ok: boolean }> {
    const ctx = client.data as WidgetSocketData;
    const input = WebRtcCallJoinSchema.parse(payload);
    await this.callRegistry.bindVisitorSocket(input.callSessionId, client.id);
    const token = this.recovery.issueToken({
      callSessionId: input.callSessionId,
      workspaceId: ctx.workspaceId,
      role: 'visitor',
    });
    client.emit('webrtc:recovery-token', {
      callSessionId: input.callSessionId,
      recoveryToken: token,
      role: 'visitor',
    });
    return { ok: true };
  }

  @SubscribeMessage('widget:call-accept')
  async handleCallAccept(client: Socket, payload: unknown): Promise<{ ok: boolean }> {
    const ctx = client.data as WidgetSocketData;
    const input = WidgetCallAcceptSchema.parse(payload);
    await this.callRegistry.bindVisitorSocket(input.callSessionId, client.id);
    await this.callRegistry.touchSignal(input.callSessionId);
    const token = this.recovery.issueToken({
      callSessionId: input.callSessionId,
      workspaceId: ctx.workspaceId,
      role: 'visitor',
    });
    client.emit('webrtc:recovery-token', {
      callSessionId: input.callSessionId,
      recoveryToken: token,
      role: 'visitor',
    });
    this.logger.log(`Widget accepted call=${input.callSessionId} workspace=${ctx.workspaceId}`);
    void this.signalRelay.replayLastOfferToVisitor({
      workspaceId: ctx.workspaceId,
      callSessionId: input.callSessionId,
      visitorSocketId: client.id,
    });
    void this.rtcBroadcast.broadcastNow(ctx.workspaceId);
    return { ok: true };
  }

  @SubscribeMessage('webrtc:call-recover')
  async handleCallRecover(client: Socket, payload: unknown): Promise<{ ok: boolean; callSessionId?: string; inviteType?: string; renegotiate?: boolean }> {
    const ctx = client.data as WidgetSocketData;
    const input = WebRtcCallRecoverSchema.parse(payload);
    const result = await this.recovery.recoverParticipant({
      token: input.recoveryToken,
      role: 'visitor',
      workspaceId: ctx.workspaceId,
      socketId: client.id,
    });
    void this.rtcBroadcast.broadcastNow(ctx.workspaceId);
    return { ok: true, ...result };
  }

  @SubscribeMessage('webrtc:call-end')
  async handleCallEnd(client: Socket, payload: unknown): Promise<{ ok: boolean }> {
    const ctx = client.data as WidgetSocketData;
    const input = WebRtcCallEndSchema.parse(payload);
    const entry = await this.callRegistry.get(input.callSessionId);
    await this.callRegistry.endCall(input.callSessionId, input.reason === 'FAILED' ? 'FAILED' : 'ENDED');
    if (entry?.visitorSessionId) {
      await this.visitors.setControlMode(
        ctx.workspaceId,
        entry.visitorSessionId,
        entry.operatorId ? 'OPERATOR' : 'AI',
      );
    }
    this.operatorBridge.emitToCallRoom(
      input.callSessionId,
      client.id,
      this.runtime,
      ctx.workspaceId,
      'webrtc:call-end',
      { type: 'webrtc:call-end', callSessionId: input.callSessionId, reason: input.reason ?? 'ENDED' },
    );
    void this.rtcBroadcast.broadcastNow(ctx.workspaceId);
    return { ok: true };
  }

  @SubscribeMessage('webrtc:turn-credentials')
  async handleTurnCredentials(client: Socket): Promise<void> {
    const ctx = client.data as WidgetSocketData;
    try {
      const creds = await this.webrtc.issueTurnCredentials(ctx.workspaceId);
      client.emit('webrtc:turn-credentials', creds ?? { disabled: true });
    } catch {
      client.emit('webrtc:turn-credentials', { disabled: true });
    }
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
