import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AiIntegration } from '@botme/database';
import {
  KB_EMBEDDING_MODEL_TIERS,
  KB_ROOT_INTEGRATION_NAME,
  aiProviderFactory,
  embedWithModelFallback,
  type AiEmbeddingsPort,
  type EmbeddingAttemptResult,
} from '@botme/ai-core';
import { IntegrationCredentialsService } from '../../../core/security/integration-credentials.service';
import { IntegrationRepository } from '../../foundation/infrastructure/integration.repository';
import { KnowledgeBaseRepository } from '../infrastructure/knowledge-base.repository';

@Injectable()
export class KnowledgeBaseModelRouter {
  private readonly logger = new Logger(KnowledgeBaseModelRouter.name);
  private readonly healthCache = new Map<string, { modelId: string; ts: number }>();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly integrations: IntegrationRepository,
    private readonly credentials: IntegrationCredentialsService,
    private readonly knowledgeBases: KnowledgeBaseRepository,
  ) {}

  defaultEmbeddingModel(): string {
    return KB_EMBEDDING_MODEL_TIERS[0]!;
  }

  embeddingModelTiers(): readonly string[] {
    return KB_EMBEDDING_MODEL_TIERS;
  }

  async resolveRootIntegration(workspaceId: string): Promise<AiIntegration> {
    const integration = await this.integrations.findRootOpenRouter(workspaceId);
    if (!integration) {
      throw new NotFoundException(
        'Root OpenRouter интеграция не найдена. Создайте integration "root" (OPENROUTER).',
      );
    }
    if (integration.status !== 'ACTIVE') {
      throw new NotFoundException('Root OpenRouter интеграция не активна');
    }
    return integration;
  }

  async syncKbEmbeddingIntegration(workspaceId: string, kbId: string): Promise<string> {
    const kb = await this.knowledgeBases.findById(workspaceId, kbId);
    if (!kb) throw new NotFoundException('База знаний не найдена');
    const root = await this.resolveRootIntegration(workspaceId);
    if (kb.embeddingIntegrationId !== root.id) {
      await this.knowledgeBases.update(kbId, {
        embeddingIntegration: { connect: { id: root.id } },
      });
      this.logger.warn(
        `Repaired KB ${kbId} embeddingIntegrationId ${kb.embeddingIntegrationId ?? 'null'} -> ${root.id}`,
      );
    }
    return root.id;
  }

  async ensureKbEmbeddingIntegration(
    workspaceId: string,
    kb: { id: string; embeddingIntegrationId: string | null; embeddingModelId: string },
  ): Promise<{ integrationId: string; modelId: string }> {
    const root = await this.resolveRootIntegration(workspaceId);
    const modelId = kb.embeddingModelId || this.defaultEmbeddingModel();
    if (kb.embeddingIntegrationId !== root.id) {
      this.logger.warn(`KB ${kb.id} wrong integration — forcing root ${root.id}`);
    }
    return { integrationId: root.id, modelId };
  }

  createAdapter(integration: AiIntegration, workspaceId: string): AiEmbeddingsPort {
    const { apiKey } = this.credentials.decryptApiKey(
      { encryptedSecret: integration.encryptedSecret, keyVersion: integration.keyVersion },
      workspaceId,
    );
    return aiProviderFactory.create(integration.provider, { apiKey });
  }

  async embedWithFallback(
    workspaceId: string,
    input: string[],
    preferredModel?: string,
  ): Promise<EmbeddingAttemptResult & { integrationId: string }> {
    const root = await this.resolveRootIntegration(workspaceId);
    const adapter = this.createAdapter(root, workspaceId);
    const tiers = preferredModel
      ? [preferredModel, ...KB_EMBEDDING_MODEL_TIERS.filter((m) => m !== preferredModel)]
      : KB_EMBEDDING_MODEL_TIERS;

    const cached = this.healthCache.get(`${workspaceId}:${root.id}`);
    const ordered =
      cached && Date.now() - cached.ts < KnowledgeBaseModelRouter.CACHE_TTL_MS
        ? [cached.modelId, ...tiers.filter((t) => t !== cached.modelId)]
        : tiers;

    const result = await embedWithModelFallback(adapter, input, ordered);
    this.healthCache.set(`${workspaceId}:${root.id}`, { modelId: result.modelId, ts: Date.now() });
    this.logger.log(
      `embed ok workspace=${workspaceId} integration=${root.name} model=${result.modelId} n=${input.length}`,
    );
    return { ...result, integrationId: root.id };
  }
}

export { KB_ROOT_INTEGRATION_NAME };
