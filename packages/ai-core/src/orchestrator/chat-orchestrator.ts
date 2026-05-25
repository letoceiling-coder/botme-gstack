import type { AiProviderType, ChatMessage, ChatStreamChunk, TokenUsage } from '../types.js';
import { aiProviderFactory } from '../factory.js';
import { sanitizeProviderError } from '../errors.js';

export interface AgentOrchestratorConfig {
  provider: AiProviderType;
  modelId: string;
  apiKey: string;
  baseUrl?: string;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
}

export interface OrchestratorMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OrchestratorStreamResult {
  content: string;
  usage: TokenUsage;
  latencyMs: number;
  finishReason: string | null;
}

export interface OrchestratorErrorInfo {
  message: string;
  retryable: boolean;
}

export class OrchestratorError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'OrchestratorError';
  }
}

export function buildChatMessages(
  systemPrompt: string,
  history: OrchestratorMessage[],
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }
  return messages;
}

export function mapStreamChunk(chunk: ChatStreamChunk): string {
  return chunk.delta;
}

export function isRetryableOrchestratorError(err: unknown): boolean {
  if (err instanceof OrchestratorError) return err.retryable;
  const msg = err instanceof Error ? err.message : '';
  return msg.includes('429') || msg.includes('503') || msg.includes('502');
}

export class ChatOrchestrator {
  async *streamCompletion(
    config: AgentOrchestratorConfig,
    history: OrchestratorMessage[],
    userMessage: string,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatStreamChunk, OrchestratorStreamResult, undefined> {
    const started = Date.now();
    const adapter = aiProviderFactory.create(config.provider, {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });
    const messages = buildChatMessages(config.systemPrompt, [
      ...history,
      { role: 'user', content: userMessage },
    ]);

    let content = '';
    let finishReason: string | null = null;
    let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      const stream = adapter.chatStream({
        model: config.modelId,
        messages,
        temperature: config.temperature,
        topP: config.topP,
        maxTokens: config.maxTokens,
        stream: true,
        signal,
      });

      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw new OrchestratorError('Генерация отменена', false);
        }
        content += chunk.delta;
        finishReason = chunk.finishReason ?? finishReason;
        if (chunk.usage) {
          usage = chunk.usage;
        }
        yield chunk;
      }
    } catch (err: unknown) {
      if (signal?.aborted) {
        throw new OrchestratorError('Генерация отменена', false);
      }
      const retryable = isRetryableOrchestratorError(err);
      throw new OrchestratorError(sanitizeProviderError(err), retryable);
    }

    return {
      content,
      usage,
      latencyMs: Date.now() - started,
      finishReason,
    };
  }
}

export const chatOrchestrator = new ChatOrchestrator();
