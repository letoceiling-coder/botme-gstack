import type { ChatStreamChunk } from '../types.js';
import {
  chatOrchestrator,
  OrchestratorError,
  type AgentOrchestratorConfig,
  type OrchestratorMessage,
  type OrchestratorStreamResult,
} from '../orchestrator/chat-orchestrator.js';

export interface AgentModelChainEntry {
  position: number;
  integrationId: string;
  modelId: string;
  provider: string;
  enabled: boolean;
  maxRetries: number;
  timeoutMs: number;
  supportsTools?: boolean;
  isFree?: boolean;
}

export interface ModelHealthState {
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  consecutiveFailures: number;
  avgLatencyMs: number;
  cooldownUntil: number | null;
}

export interface AgentStreamFailoverResult extends OrchestratorStreamResult {
  modelId: string;
  provider: string;
  integrationId: string;
  failoverFrom?: string;
  failoverReason?: string;
  retryCount: number;
}

export type FailoverReason =
  | 'timeout'
  | 'rate_limit'
  | 'overloaded'
  | 'provider_unavailable'
  | 'server_error'
  | 'forced_test';

export function isRetryableChatError(err: unknown): boolean {
  if (err instanceof OrchestratorError) return err.retryable;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    /429|502|503|504|timeout|overloaded|unavailable|rate.?limit|too many|capacity/.test(msg)
  );
}

export function isNonRetryableChatError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    /invalid api key|unauthorized|401|403|authentication|prompt too large|context length|unsupported|invalid schema|tool.*not supported/.test(
      msg,
    )
  );
}

export function classifyFailoverReason(err: unknown): FailoverReason {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (/timeout/.test(msg)) return 'timeout';
  if (/429|rate.?limit|too many/.test(msg)) return 'rate_limit';
  if (/overloaded|capacity/.test(msg)) return 'overloaded';
  if (/502|503|504|unavailable/.test(msg)) return 'provider_unavailable';
  return 'server_error';
}

export function isModelInCooldown(health: ModelHealthState | undefined, now = Date.now()): boolean {
  return !!health?.cooldownUntil && health.cooldownUntil > now;
}

export function updateModelHealth(
  health: ModelHealthState | undefined,
  success: boolean,
  latencyMs?: number,
): ModelHealthState {
  const base: ModelHealthState = health ?? {
    lastSuccessAt: null,
    lastFailureAt: null,
    consecutiveFailures: 0,
    avgLatencyMs: 0,
    cooldownUntil: null,
  };
  if (success) {
    const avg =
      latencyMs != null
        ? base.avgLatencyMs > 0
          ? Math.round(base.avgLatencyMs * 0.7 + latencyMs * 0.3)
          : latencyMs
        : base.avgLatencyMs;
    return {
      lastSuccessAt: Date.now(),
      lastFailureAt: base.lastFailureAt,
      consecutiveFailures: 0,
      avgLatencyMs: avg,
      cooldownUntil: null,
    };
  }
  const failures = base.consecutiveFailures + 1;
  const cooldownMs = failures >= 3 ? Math.min(300_000, 30_000 * failures) : 0;
  return {
    lastSuccessAt: base.lastSuccessAt,
    lastFailureAt: Date.now(),
    consecutiveFailures: failures,
    avgLatencyMs: base.avgLatencyMs,
    cooldownUntil: cooldownMs > 0 ? Date.now() + cooldownMs : null,
  };
}

export function sortChainCostAware(chain: AgentModelChainEntry[]): AgentModelChainEntry[] {
  return [...chain].sort((a, b) => {
    if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
    return a.position - b.position;
  });
}

export function filterToolCompatibleChain(
  chain: AgentModelChainEntry[],
  requireTools: boolean,
): AgentModelChainEntry[] {
  if (!requireTools) return chain;
  return chain.filter((e) => e.supportsTools !== false);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new OrchestratorError('Генерация отменена', false));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new OrchestratorError('Генерация отменена', false));
    });
  });
}

export async function* streamWithModelFallback(
  chain: AgentModelChainEntry[],
  buildConfig: (entry: AgentModelChainEntry) => AgentOrchestratorConfig,
  history: OrchestratorMessage[],
  userMessage: string,
  options?: {
    signal?: AbortSignal;
    requireTools?: boolean;
    forceFailoverIndex?: number;
    isHealthy?: (entry: AgentModelChainEntry) => boolean;
    onFailover?: (payload: {
      fromModel: string;
      toModel: string;
      reason: FailoverReason;
      retryCount: number;
      hadPartialStream: boolean;
    }) => void;
    onStreamReset?: () => void;
  },
): AsyncGenerator<ChatStreamChunk, AgentStreamFailoverResult, undefined> {
  const filtered = filterToolCompatibleChain(chain, !!options?.requireTools).filter(
    (e) => e.enabled,
  );
  const ordered =
    options?.forceFailoverIndex != null
      ? filtered.slice(options.forceFailoverIndex)
      : filtered;

  let lastError: unknown;
  let totalRetries = 0;

  for (let i = 0; i < ordered.length; i++) {
    const entry = ordered[i]!;
    if (options?.isHealthy && !options.isHealthy(entry)) continue;

    const config = buildConfig(entry);
    let entryRetries = 0;
    let hadPartialStream = false;

    const attemptSignal = entry.timeoutMs > 0
      ? AbortSignal.any([
          ...(options?.signal ? [options.signal] : []),
          AbortSignal.timeout(entry.timeoutMs),
        ])
      : options?.signal;

    while (entryRetries <= entry.maxRetries) {
      try {
        const started = Date.now();
        const gen = chatOrchestrator.streamCompletion(
          config,
          history,
          userMessage,
          attemptSignal,
        );
        let result = await gen.next();
        while (!result.done) {
          if (result.value.delta) hadPartialStream = true;
          yield result.value;
          result = await gen.next();
        }

        const prev = i > 0 ? ordered[i - 1] : undefined;
        return {
          ...result.value,
          modelId: entry.modelId,
          provider: entry.provider,
          integrationId: entry.integrationId,
          failoverFrom: prev?.modelId,
          failoverReason: prev ? classifyFailoverReason(lastError) : undefined,
          retryCount: totalRetries,
          latencyMs: Date.now() - started,
        };
      } catch (err: unknown) {
        lastError = err;
        if (options?.signal?.aborted) throw err;
        if (attemptSignal?.aborted && !options?.signal?.aborted) {
          lastError = new OrchestratorError('timeout', true);
        }
        if (isNonRetryableChatError(err)) throw err;
        if (!isRetryableChatError(lastError)) throw lastError;

        entryRetries++;
        totalRetries++;
        if (entryRetries <= entry.maxRetries) {
          await sleep(400 * entryRetries, options?.signal);
          continue;
        }

        const next = ordered[i + 1];
        if (next) {
          if (hadPartialStream) options?.onStreamReset?.();
          options?.onFailover?.({
            fromModel: entry.modelId,
            toModel: next.modelId,
            reason: classifyFailoverReason(lastError),
            retryCount: totalRetries,
            hadPartialStream,
          });
        }
        break;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new OrchestratorError('Все модели в цепочке недоступны', false);
}
