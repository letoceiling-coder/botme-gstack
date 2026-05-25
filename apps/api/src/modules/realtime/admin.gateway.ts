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
import type { JwtPayload, RealtimeEvent } from '@botme/shared';
import { PlaygroundCancelSchema, PlaygroundStartSchema, AssistantChatCancelSchema, AssistantChatStartSchema } from '@botme/shared';
import { HEARTBEAT_INTERVAL_MS, WS_NAMESPACES } from '@botme/shared';
import { hasMinRole } from '@botme/shared';
import { CorsOriginsService } from '../../core/config/cors-origins.service';
import { PlaygroundStreamService } from '../playground/application/playground-stream.service';
import { AssistantTestChatService } from '../assistant-test-chat/application/assistant-test-chat.service';
import { AdminSocketBridge } from './services/admin-socket-bridge.service';
import { RtcDiagnosticsBroadcastService } from './services/rtc-diagnostics-broadcast.service';

interface AdminSocketData {
  user: JwtPayload;
}

@WebSocketGateway({
  namespace: WS_NAMESPACES.admin,
  cors: {
    origin: process.env['CORS_ORIGINS']?.split(',').map((o) => o.trim()) ?? [
      'http://localhost:5173',
    ],
    credentials: true,
  },
})
export class AdminGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AdminGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly corsOrigins: CorsOriginsService,
    private readonly playground: PlaygroundStreamService,
    private readonly assistantChat: AssistantTestChatService,
    private readonly adminBridge: AdminSocketBridge,
    private readonly rtcBroadcast: RtcDiagnosticsBroadcastService,
  ) {}

  afterInit(server: Server): void {
    this.adminBridge.attach(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const origin = client.handshake.headers.origin;
      if (origin && !this.corsOrigins.allowedOrigins.includes(origin)) {
        throw new UnauthorizedException('Origin not allowed');
      }
      const token = this.extractToken(client);
      if (!token) {
        throw new UnauthorizedException();
      }
      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.type !== 'access') {
        throw new UnauthorizedException();
      }
      const data: AdminSocketData = { user: payload };
      client.data = data;
      await client.join(`workspace:${payload.workspaceId}`);
      this.emitPresence(payload.workspaceId, payload.sub, 'online');
      void this.rtcBroadcast.broadcastNow(payload.workspaceId);
      this.logger.log(`Admin connected user=${payload.sub} workspace=${payload.workspaceId}`);
    } catch {
      client.emit('error', { message: 'Не авторизован' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as AdminSocketData | undefined;
    if (data?.user) {
      this.playground.cancelForDisconnect(data.user.sub, data.user.workspaceId);
      this.assistantChat.cancelForUser(data.user.sub);
      this.emitPresence(data.user.workspaceId, data.user.sub, 'offline');
      this.logger.log(`Admin disconnected user=${data.user.sub}`);
    }
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket): RealtimeEvent {
    client.emit('pong', { type: 'pong', at: new Date().toISOString() } satisfies RealtimeEvent);
    return { type: 'pong', at: new Date().toISOString() };
  }

  @SubscribeMessage('admin:rtc-subscribe')
  async handleRtcSubscribe(client: Socket): Promise<{ ok: boolean }> {
    const data = client.data as AdminSocketData;
    await this.rtcBroadcast.broadcastNow(data.user.workspaceId);
    return { ok: true };
  }

  @SubscribeMessage('playground:start')
  async handlePlaygroundStart(client: Socket, payload: unknown): Promise<void> {
    const data = client.data as AdminSocketData;
    if (!hasMinRole(data.user.role, 'MEMBER')) {
      client.emit('playground:error', {
        type: 'playground:error',
        sessionId: '',
        streamId: '',
        message: 'Недостаточно прав',
        retryable: false,
      });
      return;
    }

    try {
      const input = PlaygroundStartSchema.parse(payload);
      this.logger.log(
        `playground:start agent=${input.agentId} user=${data.user.sub} workspace=${data.user.workspaceId}`,
      );

      const { sessionId, streamId } = await this.playground.startStream(
        data.user.workspaceId,
        data.user.sub,
        input,
        {
          onChunk: (delta, activeStreamId) => {
            this.logger.debug(`playground:chunk stream=${activeStreamId} len=${delta.length}`);
            client.emit('playground:chunk', {
              type: 'playground:chunk',
              sessionId,
              streamId: activeStreamId,
              delta,
            });
          },
          onStreamReset: (activeStreamId) => {
            client.emit('playground:stream-reset', {
              type: 'playground:stream-reset',
              sessionId,
              streamId: activeStreamId,
            });
          },
          onDone: ({ streamId: activeStreamId, content, usage }) => {
            this.logger.log(
              `playground:done stream=${activeStreamId} tokens=${usage.totalTokens} latency=${usage.latencyMs}ms`,
            );
            client.emit('playground:done', {
              type: 'playground:done',
              sessionId,
              streamId: activeStreamId,
              content,
              usage,
            });
          },
          onError: ({ streamId: activeStreamId, message, retryable }) => {
            this.logger.warn(`playground:error stream=${activeStreamId} ${message}`);
            client.emit('playground:error', {
              type: 'playground:error',
              sessionId,
              streamId: activeStreamId,
              message,
              retryable,
            });
          },
        },
      );

      client.emit('playground:started', { sessionId, streamId });
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message ? err.message : 'Не удалось запустить генерацию';
      this.logger.error(`playground:start failed: ${message}`);
      client.emit('playground:error', {
        type: 'playground:error',
        sessionId: '',
        streamId: '',
        message,
        retryable: false,
      });
    }
  }

  @SubscribeMessage('assistant:chat:start')
  async handleAssistantChatStart(client: Socket, payload: unknown): Promise<void> {
    const data = client.data as AdminSocketData;
    if (!hasMinRole(data.user.role, 'MEMBER')) {
      client.emit('assistant:chat:error', {
        conversationId: '',
        streamId: '',
        message: 'Недостаточно прав',
        retryable: false,
      });
      return;
    }

    try {
      const input = AssistantChatStartSchema.parse(payload);
      const { conversationId, streamId } = await this.assistantChat.startMessage(
        data.user.workspaceId,
        data.user.sub,
        input.assistantId,
        input.conversationId,
        input.message,
        client.id,
        {
          onChunk: (delta, activeStreamId) => {
            client.emit('assistant:chat:chunk', { conversationId, streamId: activeStreamId, delta });
          },
          onDone: ({ streamId: activeStreamId, messageId, content, citations, usage }) => {
            client.emit('assistant:chat:done', {
              conversationId,
              streamId: activeStreamId,
              messageId,
              content,
              citations,
              usage,
            });
          },
          onError: ({ streamId: activeStreamId, message, retryable }) => {
            client.emit('assistant:chat:error', {
              conversationId,
              streamId: activeStreamId,
              message,
              retryable,
            });
          },
        },
      );
      client.emit('assistant:chat:started', { conversationId, streamId });
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message ? err.message : 'Не удалось запустить чат';
      client.emit('assistant:chat:error', {
        conversationId: '',
        streamId: '',
        message,
        retryable: false,
      });
    }
  }

  @SubscribeMessage('assistant:chat:cancel')
  handleAssistantChatCancel(client: Socket, payload: unknown): { ok: boolean; cancelled: number } {
    const data = client.data as AdminSocketData;
    if (!hasMinRole(data.user.role, 'MEMBER')) {
      return { ok: false, cancelled: 0 };
    }
    const input = AssistantChatCancelSchema.parse(payload);
    const cancelled = this.assistantChat.cancelConversation(input.conversationId);
    return { ok: true, cancelled };
  }

  @SubscribeMessage('playground:cancel')
  handlePlaygroundCancel(client: Socket, payload: unknown): { ok: boolean; cancelled: number } {
    const data = client.data as AdminSocketData;
    if (!hasMinRole(data.user.role, 'MEMBER')) {
      return { ok: false, cancelled: 0 };
    }
    const input = PlaygroundCancelSchema.parse(payload);
    const cancelled = this.playground.cancelSession(input.sessionId);
    return { ok: true, cancelled };
  }

  private emitPresence(workspaceId: string, userId: string, status: 'online' | 'offline'): void {
    const event: RealtimeEvent = {
      type: 'presence',
      workspaceId,
      userId,
      status,
      at: new Date().toISOString(),
    };
    this.server.to(`workspace:${workspaceId}`).emit('realtime', event);
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as { token?: string };
    if (auth.token) return auth.token;
    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    const cookie = client.handshake.headers.cookie;
    if (!cookie) return undefined;
    const match = cookie.match(/access_token=([^;]+)/);
    return match?.[1];
  }
}

export { HEARTBEAT_INTERVAL_MS };
