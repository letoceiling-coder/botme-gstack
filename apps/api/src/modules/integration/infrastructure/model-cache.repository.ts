import { Injectable } from '@nestjs/common';
import type { AiModelCache } from '@botme/database';
import { WorkspaceScopedRepository } from '../../../core/repository/workspace-scoped.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { ModelDefinition } from '@botme/ai-core';
import type { AiProviderType } from '@botme/database';

@Injectable()
export class ModelCacheRepository extends WorkspaceScopedRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  listByIntegration(integrationId: string): Promise<AiModelCache[]> {
    return this.prisma.client.aiModelCache.findMany({
      where: { integrationId },
      orderBy: [{ isFree: 'desc' }, { displayName: 'asc' }],
    });
  }

  countByIntegration(integrationId: string): Promise<number> {
    return this.prisma.client.aiModelCache.count({ where: { integrationId } });
  }

  async upsertModels(
    integrationId: string,
    provider: AiProviderType,
    models: ModelDefinition[],
  ): Promise<number> {
    const syncedAt = new Date();
    let count = 0;

    for (const model of models) {
      await this.prisma.client.aiModelCache.upsert({
        where: {
          integrationId_externalId: {
            integrationId,
            externalId: model.externalId,
          },
        },
        create: {
          integrationId,
          externalId: model.externalId,
          provider,
          displayName: model.displayName,
          contextWindow: model.contextWindow,
          promptPrice: model.promptPrice,
          completionPrice: model.completionPrice,
          supportsTools: model.supportsTools,
          supportsVision: model.supportsVision,
          supportsReasoning: model.supportsReasoning,
          isFree: model.isFree,
          syncedAt,
        },
        update: {
          displayName: model.displayName,
          contextWindow: model.contextWindow,
          promptPrice: model.promptPrice,
          completionPrice: model.completionPrice,
          supportsTools: model.supportsTools,
          supportsVision: model.supportsVision,
          supportsReasoning: model.supportsReasoning,
          isFree: model.isFree,
          syncedAt,
        },
      });
      count++;
    }

    const externalIds = models.map((m) => m.externalId);
    if (externalIds.length > 0) {
      await this.prisma.client.aiModelCache.deleteMany({
        where: {
          integrationId,
          externalId: { notIn: externalIds },
        },
      });
    }

    return count;
  }
}
