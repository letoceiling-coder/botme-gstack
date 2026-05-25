import { Injectable, Logger } from '@nestjs/common';
import type { CallSessionStatus, CallSessionType } from '@botme/database';
import type { ActiveCallDto } from '@botme/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RtcRedisStoreService, type RedisCallEntry } from './rtc-redis-store.service';

/** Redis-backed active call registry — multi-instance safe, prevents zombie calls. */
@Injectable()
export class ActiveCallRegistryService {
  private readonly logger = new Logger(ActiveCallRegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisStore: RtcRedisStoreService,
  ) {}

  async nextSignalSequence(callSessionId: string): Promise<number> {
    return this.redisStore.nextSignalSequence(callSessionId);
  }

  async register(params: {
    callSessionId: string;
    workspaceId: string;
    visitorSessionId: string;
    operatorId?: string | null;
    visitorSocketId?: string | null;
    status?: CallSessionStatus;
    inviteType?: CallSessionType;
  }): Promise<void> {
    const entry: RedisCallEntry = {
      callSessionId: params.callSessionId,
      workspaceId: params.workspaceId,
      visitorSessionId: params.visitorSessionId,
      operatorId: params.operatorId ?? null,
      visitorSocketId: params.visitorSocketId ?? null,
      operatorSocketId: null,
      status: params.status ?? 'INVITED',
      iceState: null,
      reconnectCount: 0,
      usingTurn: false,
      startedAt: null,
      lastSignalAt: Date.now(),
      inviteType: params.inviteType === 'VOICE' ? 'VOICE' : 'VIDEO',
    };
    await this.redisStore.saveCall(entry);
  }

  async bindOperatorSocket(callSessionId: string, operatorSocketId: string, operatorId: string): Promise<void> {
    await this.patch(callSessionId, {
      operatorSocketId,
      operatorId,
      lastSignalAt: Date.now(),
    });
  }

  async bindVisitorSocket(callSessionId: string, visitorSocketId: string): Promise<void> {
    await this.patch(callSessionId, { visitorSocketId, lastSignalAt: Date.now() });
  }

  async touchSignal(
    callSessionId: string,
    meta?: { iceState?: string; usingTurn?: boolean },
  ): Promise<void> {
    const patch: Partial<RedisCallEntry> = { lastSignalAt: Date.now() };
    if (meta?.iceState) patch.iceState = meta.iceState;
    if (meta?.usingTurn !== undefined) patch.usingTurn = meta.usingTurn;
    const entry = await this.patch(callSessionId, patch);
  }

  async markActive(callSessionId: string): Promise<void> {
    const entry = await this.get(callSessionId);
    if (!entry) return;
    const startedAt = entry.startedAt ?? Date.now();
    await this.patch(callSessionId, { status: 'ACTIVE', startedAt });
    await this.prisma.client.callSession.update({
      where: { id: callSessionId },
      data: { status: 'ACTIVE', startedAt: new Date() },
    });
  }

  async incrementReconnect(callSessionId: string): Promise<void> {
    const entry = await this.get(callSessionId);
    if (!entry) return;
    await this.patch(callSessionId, { reconnectCount: entry.reconnectCount + 1 });
  }

  async endCall(callSessionId: string, reason: 'ENDED' | 'FAILED' = 'ENDED'): Promise<void> {
    const entry = await this.get(callSessionId);
    if (entry) {
      await this.redisStore.deleteCall(callSessionId, entry.workspaceId);
    }
    if (reason === 'FAILED') {
      this.logger.warn(`Call failed callSessionId=${callSessionId}`);
    }
    await this.prisma.client.callSession.updateMany({
      where: { id: callSessionId, status: { not: 'ENDED' } },
      data: { status: 'ENDED', endedAt: new Date() },
    });
  }

  async get(callSessionId: string): Promise<RedisCallEntry | null> {
    return this.redisStore.getCall(callSessionId);
  }

  async listActive(workspaceId: string): Promise<ActiveCallDto[]> {
    const ids = await this.redisStore.listWorkspaceCallIds(workspaceId);
    const now = Date.now();
    const rows: ActiveCallDto[] = [];
    for (const id of ids) {
      const c = await this.redisStore.getCall(id);
      if (!c || c.status === 'ENDED') continue;
      rows.push({
        callSessionId: c.callSessionId,
        visitorSessionId: c.visitorSessionId,
        operatorId: c.operatorId,
        status: c.status,
        iceState: c.iceState,
        reconnectCount: c.reconnectCount,
        usingTurn: c.usingTurn,
        durationSec: c.startedAt ? Math.floor((now - c.startedAt) / 1000) : 0,
        lastSignalAt: new Date(c.lastSignalAt).toISOString(),
      });
    }
    return rows;
  }

  async cleanupStale(maxIdleMs = 120_000): Promise<number> {
    const now = Date.now();
    let count = 0;
    // Scan is workspace-scoped in production via heartbeat; global scan via prisma ACTIVE calls
    const stale = await this.prisma.client.callSession.findMany({
      where: { status: { in: ['INVITED', 'ACTIVE'] }, updatedAt: { lt: new Date(now - maxIdleMs) } },
      select: { id: true, workspaceId: true },
      take: 100,
    });
    for (const row of stale) {
      const entry = await this.get(row.id);
      if (entry && now - entry.lastSignalAt > maxIdleMs && entry.status !== 'ACTIVE') {
        await this.endCall(row.id, 'FAILED');
        count += 1;
        this.logger.warn(`Stale call cleaned callSessionId=${row.id}`);
      }
    }
    return count;
  }

  async count(): Promise<number> {
    return 0;
  }

  private async patch(callSessionId: string, patch: Partial<RedisCallEntry>): Promise<RedisCallEntry | null> {
    return this.redisStore.patchCall(callSessionId, patch);
  }
}
