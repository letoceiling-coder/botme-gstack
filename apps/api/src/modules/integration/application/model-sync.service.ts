import { Injectable } from '@nestjs/common';
import { aiProviderFactory, sanitizeProviderError } from '@botme/ai-core';
import type { AiProviderType } from '@botme/database';
import { IntegrationCredentialsService } from '../../../core/security/integration-credentials.service';
import { ProviderCredentialsResolver } from '../../../core/config/provider-credentials.resolver';
import { IntegrationRepository } from '../../foundation/infrastructure/integration.repository';
import { ModelCacheRepository } from '../infrastructure/model-cache.repository';

@Injectable()
export class ModelSyncService {
  constructor(
    private readonly integrations: IntegrationRepository,
    private readonly modelCache: ModelCacheRepository,
    private readonly credentials: IntegrationCredentialsService,
    private readonly providerCredentials: ProviderCredentialsResolver,
  ) {}

  async syncIntegration(integrationId: string, workspaceId: string): Promise<number> {
    const integration = await this.integrations.findById(workspaceId, integrationId);
    if (!integration) {
      throw new Error('Integration not found');
    }

    const { apiKey } = this.credentials.decryptApiKey(
      { encryptedSecret: integration.encryptedSecret, keyVersion: integration.keyVersion },
      workspaceId,
    );

    const resolved = this.providerCredentials.resolveForIntegration(integration.provider, apiKey);
    const adapter = aiProviderFactory.create(integration.provider as AiProviderType, {
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
    });
    const models = await adapter.listModels();
    const count = await this.modelCache.upsertModels(
      integrationId,
      integration.provider,
      models,
    );

    await this.integrations.update(integrationId, {
      status: 'ACTIVE',
      lastValidatedAt: new Date(),
      health: { modelCount: count, syncedAt: new Date().toISOString() },
    });

    return count;
  }

  async validateAndSync(integrationId: string, workspaceId: string): Promise<{ ok: boolean; message?: string; synced: number }> {
    const integration = await this.integrations.findById(workspaceId, integrationId);
    if (!integration) {
      return { ok: false, message: 'Интеграция не найдена', synced: 0 };
    }

    const { apiKey } = this.credentials.decryptApiKey(
      { encryptedSecret: integration.encryptedSecret, keyVersion: integration.keyVersion },
      workspaceId,
    );

    const resolved = this.providerCredentials.resolveForIntegration(integration.provider, apiKey);
    const adapter = aiProviderFactory.create(integration.provider as AiProviderType, {
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
    });
    const health = await adapter.validateKey();

    if (!health.ok) {
      await this.integrations.update(integrationId, {
        status: 'INVALID',
        health: { error: health.message, at: new Date().toISOString() },
      });
      return { ok: false, message: 'Неверный API-ключ', synced: 0 };
    }

    try {
      const synced = await this.syncIntegration(integrationId, workspaceId);
      return { ok: true, synced };
    } catch (err: unknown) {
      await this.integrations.update(integrationId, { status: 'INVALID' });
      return { ok: false, message: sanitizeProviderError(err), synced: 0 };
    }
  }
}
