import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AiProviderType } from '@botme/database';
import {
  streamWithModelFallback,
  streamWithSingleToolStep,
  type AgentModelChainEntry,
  type AgentOrchestratorConfig,
  type AgentStreamFailoverResult,
  type BoundToolInfo,
  type FailoverReason,
  type ModelHealthState,
  type OrchestratorMessage,
  type ToolContext,
  isModelInCooldown,
  isNonRetryableChatError,
  isRetryableChatError,
  classifyFailoverReason,
  updateModelHealth,
  OrchestratorError,
} from '@botme/ai-core';
import type { AgentModelFallbackDto, AgentRuntimeDiagnosticsDto } from '@botme/shared';
import { IntegrationCredentialsService } from '../../../core/security/integration-credentials.service';
import { ProviderCredentialsResolver } from '../../../core/config/provider-credentials.resolver';
import { IntegrationRepository } from '../../foundation/infrastructure/integration.repository';
import { IntegrationModelChainRepository } from '../../integration/infrastructure/integration-model-chain.repository';
import { ModelCacheRepository } from '../../integration/infrastructure/model-cache.repository';
import { AgentRepository } from '../infrastructure/agent.repository';
import { AgentModelFallbackRepository } from '../infrastructure/agent-model-fallback.repository';

export interface AgentRuntimeContext {
  workspaceId: string;
  agentId: string;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  requireTools?: boolean;
  forceFailoverIndex?: number;
}

@Injectable()
export class AgentModelRuntimeRouter {
  private readonly logger = new Logger(AgentModelRuntimeRouter.name);
  private readonly healthCache = new Map<string, ModelHealthState>();
  private readonly lastUsed = new Map<string, { modelId: string; reason?: FailoverReason; at: number }>();
  private static readonly HEALTH_CACHE_MAX = 2000;

  constructor(
    private readonly agents: AgentRepository,
    private readonly fallbacks: AgentModelFallbackRepository,
    private readonly integrationChain: IntegrationModelChainRepository,
    private readonly integrations: IntegrationRepository,
    private readonly modelCache: ModelCacheRepository,
    private readonly credentials: IntegrationCredentialsService,
    private readonly providerCredentials: ProviderCredentialsResolver,
  ) {}

  async buildChain(workspaceId: string, agentId: string): Promise<AgentModelChainEntry[]> {
    const agent = await this.agents.findById(workspaceId, agentId);
    if (!agent) throw new NotFoundException('Агент не найден');

    const primary = await this.toChainEntry(workspaceId, {
      position: 0,
      integrationId: agent.integrationId,
      modelId: agent.modelId,
      enabled: true,
      maxRetries: 2,
      timeoutMs: 120_000,
    });

    const fallbackRows = await this.fallbacks.listByAgent(workspaceId, agentId);
    let fallbackEntries: AgentModelChainEntry[];

    if (fallbackRows.length > 0) {
      fallbackEntries = await Promise.all(
        fallbackRows.map((r) => this.toChainEntry(workspaceId, r)),
      );
    } else {
      const integrationRows = await this.integrationChain.listByIntegration(agent.integrationId);
      const chainRows = integrationRows.filter((r) => r.enabled && r.modelId !== agent.modelId);

      if (chainRows.length > 0) {
        fallbackEntries = await Promise.all(
          chainRows.map((r, index) =>
            this.toChainEntry(workspaceId, {
              position: index + 1,
              integrationId: agent.integrationId,
              modelId: r.modelId,
              enabled: r.enabled,
              maxRetries: r.maxRetries,
              timeoutMs: r.timeoutMs,
            }),
          ),
        );
      } else {
        const autoModelIds = await this.resolveAutoFallbackModels(
          agent.integrationId,
          agent.modelId,
        );
        fallbackEntries = await Promise.all(
          autoModelIds.map((modelId, index) =>
            this.toChainEntry(workspaceId, {
              position: index + 1,
              integrationId: agent.integrationId,
              modelId,
              enabled: true,
              maxRetries: 2,
              timeoutMs: 120_000,
            }),
          ),
        );
      }
    }

    return [primary, ...fallbackEntries];
  }

  /** When integration chain is empty — pick free/cheap synced models as fallbacks. */
  private async resolveAutoFallbackModels(
    integrationId: string,
    excludeModelId: string,
  ): Promise<string[]> {
    const models = await this.modelCache.listByIntegration(integrationId);
    return models
      .filter((m) => m.externalId !== excludeModelId)
      .sort((a, b) => {
        if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
        const pa = Number(a.promptPrice ?? 999);
        const pb = Number(b.promptPrice ?? 999);
        return pa - pb;
      })
      .slice(0, 8)
      .map((m) => m.externalId);
  }

  async *streamWithFailover(
    ctx: AgentRuntimeContext,
    history: OrchestratorMessage[],
    userMessage: string,
    signal?: AbortSignal,
    hooks?: { onStreamReset?: () => void },
  ): AsyncGenerator<{ delta: string }, AgentStreamFailoverResult, undefined> {
    const chain = await this.buildChain(ctx.workspaceId, ctx.agentId);
    const configMap = await this.buildConfigMap(ctx, chain);

    const gen = streamWithModelFallback(
      chain,
      (entry) => configMap.get(this.healthKey(entry))!,
      history,
      userMessage,
      {
        signal,
        requireTools: ctx.requireTools,
        forceFailoverIndex: ctx.forceFailoverIndex,
        isHealthy: (entry) => !isModelInCooldown(this.healthCache.get(this.healthKey(entry))),
        onStreamReset: hooks?.onStreamReset,
        onFailover: ({ fromModel, toModel, reason }) => {
          this.recordFailure(chain.find((e) => e.modelId === fromModel));
          this.logger.warn(
            `MODEL_FAILOVER agentId=${ctx.agentId} from=${fromModel} to=${toModel} reason=${reason}`,
          );
          this.lastUsed.set(ctx.agentId, { modelId: toModel, reason, at: Date.now() });
        },
      },
    );

    let result = await gen.next();
    while (!result.done) {
      if (result.value.delta) yield { delta: result.value.delta };
      result = await gen.next();
    }

    const used = result.value;
    this.recordSuccess(used.integrationId, used.modelId, used.latencyMs);
    this.lastUsed.set(ctx.agentId, { modelId: used.modelId, at: Date.now() });
    this.logger.log(
      `MODEL_OK agentId=${ctx.agentId} model=${used.modelId} failover=${used.failoverFrom ?? 'none'}`,
    );
    return used;
  }

  async *streamWithToolsFailover(
    ctx: AgentRuntimeContext,
    history: OrchestratorMessage[],
    userMessage: string,
    tools: BoundToolInfo[],
    toolContext: ToolContext,
    signal?: AbortSignal,
    hooks?: { onStreamReset?: () => void },
  ): AsyncGenerator<
    { delta: string },
    { content: string; toolUsed: boolean; toolType?: string; modelId: string; provider: string; failoverFrom?: string },
    undefined
  > {
    const chain = await this.buildChain(ctx.workspaceId, ctx.agentId);
    const filtered = ctx.requireTools || tools.length > 0
      ? chain.filter((e) => e.supportsTools !== false && e.enabled)
      : chain.filter((e) => e.enabled);

    let lastError: unknown;
    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i]!;
      if (isModelInCooldown(this.healthCache.get(this.healthKey(entry)))) continue;

      const attemptSignal = entry.timeoutMs > 0
        ? AbortSignal.any([
            ...(signal ? [signal] : []),
            AbortSignal.timeout(entry.timeoutMs),
          ])
        : signal;

      let entryRetries = 0;
      let hadPartialStream = false;

      while (entryRetries <= entry.maxRetries) {
        try {
          const config = await this.buildOrchestratorConfigAsync(ctx, entry);
          const gen = streamWithSingleToolStep({
            config,
            history,
            userMessage,
            tools,
            toolContext,
            signal: attemptSignal,
          });
          let result = await gen.next();
          while (!result.done) {
            if (result.value.delta) hadPartialStream = true;
            yield { delta: result.value.delta };
            result = await gen.next();
          }
          this.recordSuccess(entry.integrationId, entry.modelId);
          const prev = i > 0 ? filtered[i - 1] : undefined;
          if (prev) {
            this.logger.warn(
              `MODEL_FAILOVER agentId=${ctx.agentId} from=${prev.modelId} to=${entry.modelId}`,
            );
          }
          this.lastUsed.set(ctx.agentId, { modelId: entry.modelId, at: Date.now() });
          return {
            ...result.value,
            modelId: entry.modelId,
            provider: entry.provider,
            failoverFrom: prev?.modelId,
          };
        } catch (err) {
          lastError = err;
          if (signal?.aborted) throw err;
          if (attemptSignal?.aborted && !signal?.aborted) {
            lastError = new OrchestratorError('timeout', true);
          }
          if (isNonRetryableChatError(err)) throw err;
          if (!isRetryableChatError(lastError)) throw lastError;

          entryRetries++;
          this.recordFailure(entry);
          if (entryRetries <= entry.maxRetries) {
            await new Promise((r) => setTimeout(r, 400 * entryRetries));
            continue;
          }

          const next = filtered[i + 1];
          if (next) {
            if (hadPartialStream) hooks?.onStreamReset?.();
            this.logger.warn(
              `MODEL_FAILOVER agentId=${ctx.agentId} from=${entry.modelId} to=${next.modelId} reason=${classifyFailoverReason(lastError)} partial=${hadPartialStream}`,
            );
            this.lastUsed.set(ctx.agentId, {
              modelId: next.modelId,
              reason: classifyFailoverReason(lastError),
              at: Date.now(),
            });
          }
          break;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('All models failed');
  }

  async getDiagnostics(workspaceId: string, agentId: string): Promise<AgentRuntimeDiagnosticsDto> {
    const chain = await this.buildChain(workspaceId, agentId);
    const last = this.lastUsed.get(agentId);
    return {
      agentId,
      chain: chain.map((e) => ({
        position: e.position,
        integrationId: e.integrationId,
        modelId: e.modelId,
        provider: e.provider,
        enabled: e.enabled,
        isFree: e.isFree ?? false,
        supportsTools: e.supportsTools ?? false,
        health: this.healthCache.get(this.healthKey(e)) ?? null,
      })),
      lastUsedModelId: last?.modelId ?? null,
      lastFailoverReason: last?.reason ?? null,
      lastUsedAt: last?.at ? new Date(last.at).toISOString() : null,
    };
  }

  toFallbackDtos(rows: Awaited<ReturnType<AgentModelFallbackRepository['listByAgent']>>): AgentModelFallbackDto[] {
    return rows.map((r) => ({
      id: r.id,
      position: r.position,
      integrationId: r.integrationId,
      modelId: r.modelId,
      enabled: r.enabled,
      maxRetries: r.maxRetries,
      timeoutMs: r.timeoutMs,
    }));
  }

  async buildOrchestratorConfigAsync(
    ctx: AgentRuntimeContext,
    entry: AgentModelChainEntry,
  ): Promise<AgentOrchestratorConfig> {
    const integration = await this.integrations.findById(ctx.workspaceId, entry.integrationId);
    if (!integration) throw new NotFoundException('Интеграция не найдена');
    const { apiKey } = this.credentials.decryptApiKey(
      { encryptedSecret: integration.encryptedSecret, keyVersion: integration.keyVersion },
      ctx.workspaceId,
    );
    const resolved = this.providerCredentials.resolveForIntegration(
      integration.provider as AiProviderType,
      apiKey,
    );
    return {
      provider: integration.provider as AiProviderType,
      modelId: entry.modelId,
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
      systemPrompt: ctx.systemPrompt,
      temperature: ctx.temperature,
      topP: ctx.topP,
      maxTokens: ctx.maxTokens,
    };
  }

  private async buildConfigMap(
    ctx: AgentRuntimeContext,
    chain: AgentModelChainEntry[],
  ): Promise<Map<string, AgentOrchestratorConfig>> {
    const map = new Map<string, AgentOrchestratorConfig>();
    for (const entry of chain) {
      map.set(this.healthKey(entry), await this.buildOrchestratorConfigAsync(ctx, entry));
    }
    return map;
  }

  private async toChainEntry(
    workspaceId: string,
    row: {
      position: number;
      integrationId: string;
      modelId: string;
      enabled: boolean;
      maxRetries: number;
      timeoutMs: number;
    },
  ): Promise<AgentModelChainEntry> {
    const integration = await this.integrations.findById(workspaceId, row.integrationId);
    if (!integration) throw new NotFoundException(`Интеграция ${row.integrationId} не найдена`);
    const models = await this.modelCache.listByIntegration(row.integrationId);
    const cached = models.find((m) => m.externalId === row.modelId);
    return {
      position: row.position,
      integrationId: row.integrationId,
      modelId: row.modelId,
      provider: integration.provider,
      enabled: row.enabled,
      maxRetries: row.maxRetries,
      timeoutMs: row.timeoutMs,
      supportsTools: cached?.supportsTools ?? true,
      isFree: cached?.isFree ?? false,
    };
  }

  private recordSuccess(integrationId: string, modelId: string, latencyMs?: number): void {
    const key = `${integrationId}:${modelId}`;
    this.healthCache.set(key, updateModelHealth(this.healthCache.get(key), true, latencyMs));
    this.trimHealthCache();
  }

  private recordFailure(entry?: AgentModelChainEntry): void {
    if (!entry) return;
    const key = this.healthKey(entry);
    this.healthCache.set(key, updateModelHealth(this.healthCache.get(key), false));
    this.trimHealthCache();
  }

  private trimHealthCache(): void {
    if (this.healthCache.size <= AgentModelRuntimeRouter.HEALTH_CACHE_MAX) return;
    const oldest = [...this.healthCache.entries()]
      .sort((a, b) => (a[1].lastFailureAt ?? 0) - (b[1].lastFailureAt ?? 0))
      .slice(0, this.healthCache.size - AgentModelRuntimeRouter.HEALTH_CACHE_MAX);
    for (const [key] of oldest) this.healthCache.delete(key);
  }

  private healthKey(entry: Pick<AgentModelChainEntry, 'integrationId' | 'modelId'>): string {
    return `${entry.integrationId}:${entry.modelId}`;
  }
}
