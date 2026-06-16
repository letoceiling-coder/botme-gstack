import { Injectable } from '@nestjs/common';
import type { IntegrationModelChainItem } from '@botme/database';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class IntegrationModelChainRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByIntegration(integrationId: string): Promise<IntegrationModelChainItem[]> {
    return this.prisma.client.integrationModelChainItem.findMany({
      where: { integrationId },
      orderBy: { position: 'asc' },
    });
  }

  async replaceForIntegration(
    workspaceId: string,
    integrationId: string,
    rows: Array<{
      modelId: string;
      enabled?: boolean;
      maxRetries?: number;
      timeoutMs?: number;
    }>,
  ): Promise<IntegrationModelChainItem[]> {
    await this.prisma.client.integrationModelChainItem.deleteMany({
      where: { integrationId, workspaceId },
    });
    if (rows.length === 0) return [];
    await this.prisma.client.integrationModelChainItem.createMany({
      data: rows.map((r, index) => ({
        workspaceId,
        integrationId,
        position: index + 1,
        modelId: r.modelId,
        enabled: r.enabled ?? true,
        maxRetries: r.maxRetries ?? 2,
        timeoutMs: r.timeoutMs ?? 120_000,
      })),
    });
    return this.listByIntegration(integrationId);
  }
}

export type { IntegrationModelChainItem };
