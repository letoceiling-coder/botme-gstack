import { Injectable } from '@nestjs/common';
import type { AgentModelFallback, Prisma } from '@botme/database';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class AgentModelFallbackRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByAgent(workspaceId: string, agentId: string): Promise<AgentModelFallback[]> {
    return this.prisma.client.agentModelFallback.findMany({
      where: { workspaceId, agentId },
      orderBy: { position: 'asc' },
    });
  }

  async replaceForAgent(
    workspaceId: string,
    agentId: string,
    rows: Array<{
      position: number;
      integrationId: string;
      modelId: string;
      enabled?: boolean;
      maxRetries?: number;
      timeoutMs?: number;
    }>,
  ): Promise<AgentModelFallback[]> {
    await this.prisma.client.agentModelFallback.deleteMany({ where: { agentId, workspaceId } });
    if (rows.length === 0) return [];
    await this.prisma.client.agentModelFallback.createMany({
      data: rows.map((r) => ({
        workspaceId,
        agentId,
        position: r.position,
        integrationId: r.integrationId,
        modelId: r.modelId,
        enabled: r.enabled ?? true,
        maxRetries: r.maxRetries ?? 2,
        timeoutMs: r.timeoutMs ?? 120_000,
      })),
    });
    return this.listByAgent(workspaceId, agentId);
  }
}

export type { AgentModelFallback };
