import { Injectable, Logger } from '@nestjs/common';
import type { VisitorSession, VisitorControlMode } from '@botme/database';
import type { LiveVisitorDto } from '@botme/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';

const IDLE_MS = 120_000;
const STALE_MS = 300_000;

@Injectable()
export class LiveVisitorTrackerService {
  private readonly logger = new Logger(LiveVisitorTrackerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertConnected(params: {
    workspaceId: string;
    widgetId: string;
    visitorId: string;
    conversationId?: string;
    socketId: string;
    currentPage?: string;
    device?: Record<string, unknown>;
    reconnect?: boolean;
  }): Promise<VisitorSession> {
    const existing = await this.prisma.client.visitorSession.findUnique({
      where: {
        workspaceId_widgetId_visitorId: {
          workspaceId: params.workspaceId,
          widgetId: params.widgetId,
          visitorId: params.visitorId,
        },
      },
    });

    const reconnectCount = params.reconnect
      ? (existing?.reconnectCount ?? 0) + 1
      : (existing?.reconnectCount ?? 0);

    return this.prisma.client.visitorSession.upsert({
      where: {
        workspaceId_widgetId_visitorId: {
          workspaceId: params.workspaceId,
          widgetId: params.widgetId,
          visitorId: params.visitorId,
        },
      },
      create: {
        workspaceId: params.workspaceId,
        widgetId: params.widgetId,
        visitorId: params.visitorId,
        conversationId: params.conversationId,
        socketId: params.socketId,
        currentPage: params.currentPage,
        device: params.device as object | undefined,
        status: 'ONLINE',
        reconnectCount,
        connectedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
      update: {
        conversationId: params.conversationId ?? undefined,
        socketId: params.socketId,
        currentPage: params.currentPage ?? undefined,
        status: 'ONLINE',
        reconnectCount,
        disconnectedAt: null,
        lastHeartbeatAt: new Date(),
      },
    });
  }

  async heartbeat(params: {
    workspaceId: string;
    widgetId: string;
    visitorId: string;
    currentPage?: string;
    tabVisible?: boolean;
  }) {
    const now = new Date();
    const session = await this.prisma.client.visitorSession.updateMany({
      where: {
        workspaceId: params.workspaceId,
        widgetId: params.widgetId,
        visitorId: params.visitorId,
      },
      data: {
        lastHeartbeatAt: now,
        currentPage: params.currentPage,
        tabVisible: params.tabVisible ?? true,
        status: 'ONLINE',
      },
    });
    return session.count;
  }

  async markDisconnected(workspaceId: string, widgetId: string, visitorId: string) {
    await this.prisma.client.visitorSession.updateMany({
      where: { workspaceId, widgetId, visitorId },
      data: { status: 'OFFLINE', disconnectedAt: new Date(), socketId: null },
    });
  }

  async findByConversation(
    workspaceId: string,
    conversationId: string,
  ): Promise<VisitorSession | null> {
    return this.prisma.client.visitorSession.findFirst({
      where: { workspaceId, conversationId, status: { in: ['ONLINE', 'IDLE'] } },
    });
  }

  async setControlMode(workspaceId: string, visitorSessionId: string, controlMode: VisitorControlMode) {
    return this.prisma.client.visitorSession.updateMany({
      where: { id: visitorSessionId, workspaceId },
      data: { controlMode },
    });
  }

  async listLive(workspaceId: string): Promise<LiveVisitorDto[]> {
    const cutoff = new Date(Date.now() - STALE_MS);
    const rows = await this.prisma.client.visitorSession.findMany({
      where: {
        workspaceId,
        lastHeartbeatAt: { gte: cutoff },
        status: { in: ['ONLINE', 'IDLE'] },
      },
      orderBy: { lastHeartbeatAt: 'desc' },
      take: 500,
    });

    const now = Date.now();
    return rows.map((r) => {
      const idle = now - r.lastHeartbeatAt.getTime() > IDLE_MS;
      return {
        visitorSessionId: r.id,
        visitorId: r.visitorId,
        widgetId: r.widgetId,
        conversationId: r.conversationId,
        status: idle ? 'IDLE' : r.status,
        controlMode: r.controlMode,
        currentPage: r.currentPage,
        reconnectCount: r.reconnectCount,
        lastHeartbeatAt: r.lastHeartbeatAt.toISOString(),
        sessionDurationSec: Math.floor((now - r.connectedAt.getTime()) / 1000),
        country: r.country,
        deviceSummary: summarizeDevice(r.device),
      };
    });
  }

  async cleanupStale(): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_MS);
    const result = await this.prisma.client.visitorSession.updateMany({
      where: {
        status: { in: ['ONLINE', 'IDLE'] },
        lastHeartbeatAt: { lt: cutoff },
      },
      data: { status: 'OFFLINE', disconnectedAt: new Date(), socketId: null },
    });
    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} stale visitor session(s) offline`);
    }
    return result.count;
  }
}

function summarizeDevice(device: unknown): string | null {
  if (!device || typeof device !== 'object') return null;
  const d = device as Record<string, unknown>;
  const parts = [d['browser'], d['os'], d['device']].filter(Boolean);
  return parts.length ? parts.join(' / ') : null;
}
