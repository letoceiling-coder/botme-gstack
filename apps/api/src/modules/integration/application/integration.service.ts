import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import type { AiIntegration } from '@botme/database';
import type {
  CreateIntegrationInput,
  IntegrationDto,
  IntegrationModelChainItemDto,
  ModelCacheDto,
  UpdateIntegrationInput,
  ValidateIntegrationResult,
} from '@botme/shared';
import { IntegrationCredentialsService } from '../../../core/security/integration-credentials.service';
import { ProviderCredentialsResolver } from '../../../core/config/provider-credentials.resolver';
import { RedisService } from '../../../core/redis/redis.service';
import { AuditService } from '../../foundation/application/audit.service';
import { IntegrationRepository } from '../../foundation/infrastructure/integration.repository';
import { IntegrationModelChainRepository } from '../infrastructure/integration-model-chain.repository';
import { ModelCacheRepository } from '../infrastructure/model-cache.repository';
import { ModelSyncService } from './model-sync.service';

@Injectable()
export class IntegrationService {
  private readonly syncQueue: Queue;

  constructor(
    private readonly integrations: IntegrationRepository,
    private readonly modelCache: ModelCacheRepository,
    private readonly modelChain: IntegrationModelChainRepository,
    private readonly credentials: IntegrationCredentialsService,
    private readonly providerCredentials: ProviderCredentialsResolver,
    private readonly modelSync: ModelSyncService,
    private readonly audit: AuditService,
    redis: RedisService,
  ) {
    this.syncQueue = new Queue('integration.sync-models', {
      connection: redis.client,
    });
  }

  async list(workspaceId: string): Promise<IntegrationDto[]> {
    const rows = await this.integrations.listByWorkspace(workspaceId);
    return Promise.all(rows.map((row) => this.toDto(row, workspaceId)));
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateIntegrationInput,
    ip?: string,
  ): Promise<IntegrationDto> {
    const apiKey =
      input.provider === 'OLLAMA_NEEKLO'
        ? this.providerCredentials.requireOllamaNeekloToken()
        : input.apiKey;
    const stored = this.credentials.encryptApiKey(apiKey, workspaceId);
    const row = await this.integrations.create({
      workspace: { connect: { id: workspaceId } },
      provider: input.provider,
      name: input.name,
      encryptedSecret: new Uint8Array(stored.encryptedSecret),
      keyVersion: stored.keyVersion,
      isDefault: input.isDefault ?? false,
      status: 'PENDING_VALIDATION',
    });

    if (input.isDefault) {
      await this.integrations.clearOtherDefaults(workspaceId, row.id);
    }

    if (input.modelChain !== undefined) {
      await this.modelChain.replaceForIntegration(workspaceId, row.id, input.modelChain);
    }

    await this.audit.logIntegrationCreated(workspaceId, userId, row.id, {
      provider: input.provider,
      name: input.name,
    }, ip);

    const validation = await this.modelSync.validateAndSync(row.id, workspaceId);
    if (!validation.ok) {
      const updated = await this.integrations.findById(workspaceId, row.id);
      if (updated) return this.toDto(updated, workspaceId);
    }

    const final = await this.integrations.findById(workspaceId, row.id);
    return this.toDto(final ?? row, workspaceId);
  }

  async update(
    workspaceId: string,
    userId: string,
    id: string,
    input: UpdateIntegrationInput,
    ip?: string,
  ): Promise<IntegrationDto> {
    const existing = await this.integrations.findById(workspaceId, id);
    if (!existing) throw new NotFoundException('Интеграция не найдена');

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data['name'] = input.name;
    if (input.isDefault !== undefined) data['isDefault'] = input.isDefault;
    if (input.status !== undefined) data['status'] = input.status;

    if (input.apiKey) {
      const stored = this.credentials.encryptApiKey(input.apiKey, workspaceId, existing.keyVersion);
      data['encryptedSecret'] = new Uint8Array(stored.encryptedSecret);
      data['status'] = 'PENDING_VALIDATION';
    }

    const row = await this.integrations.update(id, data);

    if (input.isDefault) {
      await this.integrations.clearOtherDefaults(workspaceId, id);
    }

    if (input.apiKey) {
      await this.modelSync.validateAndSync(id, workspaceId);
    }

    if (input.modelChain !== undefined) {
      await this.modelChain.replaceForIntegration(workspaceId, id, input.modelChain);
    }

    await this.audit.logIntegrationUpdated(workspaceId, userId, id, {
      fields: Object.keys(input),
    }, ip);

    const refreshed = await this.integrations.findById(workspaceId, id);
    return this.toDto(refreshed ?? row, workspaceId);
  }

  async remove(workspaceId: string, userId: string, id: string, ip?: string): Promise<{ ok: true }> {
    const deleted = await this.integrations.softDelete(workspaceId, id);
    if (!deleted) throw new NotFoundException('Интеграция не найдена');

    await this.audit.logIntegrationDeleted(workspaceId, userId, id, {}, ip);
    return { ok: true };
  }

  async validate(workspaceId: string, id: string): Promise<ValidateIntegrationResult> {
    const result = await this.modelSync.validateAndSync(id, workspaceId);
    const row = await this.integrations.findById(workspaceId, id);
    return {
      ok: result.ok,
      status: row?.status ?? 'INVALID',
      message: result.message,
    };
  }

  async enqueueSync(workspaceId: string, id: string): Promise<{ queued: true; jobId: string }> {
    const existing = await this.integrations.findById(workspaceId, id);
    if (!existing) throw new NotFoundException('Интеграция не найдена');

    const job = await this.syncQueue.add(
      'sync',
      { integrationId: id, workspaceId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    if (!job.id) throw new BadRequestException('Не удалось поставить задачу в очередь');
    return { queued: true, jobId: String(job.id) };
  }

  async listModels(workspaceId: string, integrationId: string): Promise<ModelCacheDto[]> {
    const integration = await this.integrations.findById(workspaceId, integrationId);
    if (!integration) throw new NotFoundException('Интеграция не найдена');

    const models = await this.modelCache.listByIntegration(integrationId);
    return models.map((m) => ({
      id: m.id,
      externalId: m.externalId,
      displayName: m.displayName,
      contextWindow: m.contextWindow,
      promptPrice: m.promptPrice?.toString() ?? null,
      completionPrice: m.completionPrice?.toString() ?? null,
      supportsTools: m.supportsTools,
      supportsVision: m.supportsVision,
      supportsReasoning: m.supportsReasoning,
      isFree: m.isFree,
      syncedAt: m.syncedAt.toISOString(),
    }));
  }

  private async toDto(row: AiIntegration, workspaceId: string): Promise<IntegrationDto> {
    const modelCount = await this.modelCache.countByIntegration(row.id);
    const chainRows = await this.modelChain.listByIntegration(row.id);
    const maskedKey = this.providerCredentials.isEnvManaged(row.provider)
      ? '•••• (сервер)'
      : this.credentials.maskFromStored(
          { encryptedSecret: row.encryptedSecret, keyVersion: row.keyVersion },
          workspaceId,
        );
    return {
      id: row.id,
      provider: row.provider as IntegrationDto['provider'],
      name: row.name,
      maskedKey,
      isDefault: row.isDefault,
      status: row.status,
      lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
      modelCount,
      modelChain: chainRows.map(
        (r): IntegrationModelChainItemDto => ({
          position: r.position,
          modelId: r.modelId,
          enabled: r.enabled,
          maxRetries: r.maxRetries,
          timeoutMs: r.timeoutMs,
        }),
      ),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
