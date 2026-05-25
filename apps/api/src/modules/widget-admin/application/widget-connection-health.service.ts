import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect as netConnect } from 'node:net';
import type { HealthCheckItemDto, HealthStatus, WidgetConnectionHealthDto } from '@botme/shared';
import { WS_NAMESPACES } from '@botme/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { RealtimeRuntimeService } from '../../realtime/services/realtime-runtime.service';
import { WebRtcSignalService } from '../../realtime/services/webrtc-signal.service';

@Injectable()
export class WidgetConnectionHealthService {
  private readonly logger = new Logger(WidgetConnectionHealthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly runtime: RealtimeRuntimeService,
    private readonly webrtc: WebRtcSignalService,
  ) {}

  async check(workspaceId: string, widgetId: string, assistantId: string): Promise<WidgetConnectionHealthDto> {
    const checkedAt = new Date().toISOString();
    const rt = this.runtime.getRuntime();
    const wsSockets = rt.sockets.listByWorkspace(workspaceId).filter(
      (s) => s.namespace === WS_NAMESPACES.widget,
    );
    const opSockets = rt.sockets.listByWorkspace(workspaceId).filter(
      (s) => s.namespace === WS_NAMESPACES.operator,
    );

    const checks = await Promise.all([
      this.checkWebSocket(checkedAt),
      this.checkRtcSignaling(checkedAt),
      this.checkTurn(checkedAt),
      this.checkWidgetRuntime(checkedAt),
      this.checkAssistantRuntime(workspaceId, assistantId, checkedAt),
      this.checkAiRuntime(workspaceId, checkedAt),
    ]);

    const overall = this.aggregateOverall(checks.map((c) => c.status));

    return {
      overall,
      checks,
      operatorSocketsOnline: opSockets.length,
      widgetSocketsOnline: wsSockets.length,
    };
  }

  private aggregateOverall(statuses: HealthStatus[]): HealthStatus {
    if (statuses.every((s) => s === 'online')) return 'online';
    if (statuses.some((s) => s === 'offline')) return 'offline';
    return 'degraded';
  }

  private async checkWebSocket(checkedAt: string): Promise<HealthCheckItemDto> {
    try {
      const pong = await this.redis.client.ping();
      const ok = pong === 'PONG';
      return {
        id: 'websocket',
        label: 'WebSocket',
        status: ok ? 'online' : 'degraded',
        detail: ok ? 'Redis и realtime backend активны' : 'Redis ping failed',
        checkedAt,
      };
    } catch (err) {
      this.logger.warn('websocket health failed', err);
      return {
        id: 'websocket',
        label: 'WebSocket',
        status: 'offline',
        detail: 'Redis/realtime недоступен',
        checkedAt,
      };
    }
  }

  private checkRtcSignaling(checkedAt: string): Promise<HealthCheckItemDto> {
    const enabled = this.webrtc.isEnabled();
    return Promise.resolve({
      id: 'rtc_signaling',
      label: 'RTC signaling',
      status: enabled ? 'online' : 'offline',
      detail: enabled ? 'FEATURE_RTC_CALLS включён' : 'RTC отключён в конфигурации',
      checkedAt,
    });
  }

  private checkTurn(checkedAt: string): Promise<HealthCheckItemDto> {
    const host = this.config.get<string>('TURN_HOST', 'turn.neeklo.ru');
    const port = 3478;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        socket.destroy();
        resolve({
          id: 'turn',
          label: 'TURN server',
          status: 'degraded',
          detail: `${host}:${port} — timeout (STUN/host может работать)`,
          checkedAt,
        });
      }, 4000);
      const socket = netConnect({ host, port }, () => {
        clearTimeout(timer);
        socket.end();
        resolve({
          id: 'turn',
          label: 'TURN server',
          status: 'online',
          detail: `${host}:${port} — TCP доступен`,
          checkedAt,
        });
      });
      socket.on('error', () => {
        clearTimeout(timer);
        resolve({
          id: 'turn',
          label: 'TURN server',
          status: 'degraded',
          detail: `${host}:${port} — недоступен по TCP`,
          checkedAt,
        });
      });
    });
  }

  private async checkWidgetRuntime(checkedAt: string): Promise<HealthCheckItemDto> {
    const origin = this.config.get<string>('WEB_URL', 'https://agent.neeklo.ru').replace(/\/$/, '');
    const url = `${origin}/widget.js`;
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      const ok = res.ok;
      return {
        id: 'widget_runtime',
        label: 'Widget runtime',
        status: ok ? 'online' : 'offline',
        detail: ok ? `${url} — ${res.status}` : `${url} — HTTP ${res.status}`,
        checkedAt,
      };
    } catch {
      return {
        id: 'widget_runtime',
        label: 'Widget runtime',
        status: 'offline',
        detail: `${url} — недоступен`,
        checkedAt,
      };
    }
  }

  private async checkAssistantRuntime(
    workspaceId: string,
    assistantId: string,
    checkedAt: string,
  ): Promise<HealthCheckItemDto> {
    const assistant = await this.prisma.client.assistant.findFirst({
      where: { id: assistantId, workspaceId, deletedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        isActive: true,
        agent: { select: { modelId: true, status: true } },
      },
    });
    if (!assistant) {
      return {
        id: 'assistant_runtime',
        label: 'Assistant runtime',
        status: 'offline',
        detail: 'Ассистент не найден',
        checkedAt,
      };
    }
    const ok =
      assistant.status === 'ACTIVE' &&
      assistant.isActive &&
      assistant.agent.status === 'ACTIVE' &&
      Boolean(assistant.agent.modelId);
    return {
      id: 'assistant_runtime',
      label: 'Assistant runtime',
      status: ok ? 'online' : 'degraded',
      detail: ok
        ? `${assistant.name} — ACTIVE`
        : `${assistant.name} — ${assistant.status}`,
      checkedAt,
    };
  }

  private async checkAiRuntime(workspaceId: string, checkedAt: string): Promise<HealthCheckItemDto> {
    const integration = await this.prisma.client.aiIntegration.findFirst({
      where: { workspaceId, deletedAt: null, isDefault: true },
      select: { name: true, status: true, provider: true },
    });
    if (!integration) {
      return {
        id: 'ai_runtime',
        label: 'AI runtime',
        status: 'degraded',
        detail: 'Интеграция по умолчанию не настроена',
        checkedAt,
      };
    }
    const ok = integration.status === 'ACTIVE';
    return {
      id: 'ai_runtime',
      label: 'AI runtime',
      status: ok ? 'online' : 'degraded',
      detail: `${integration.provider} / ${integration.name} — ${integration.status}`,
      checkedAt,
    };
  }
}
