import { fetchJson, fetchSSE } from '../http-client.js';
import { normalizeOpenRouterModels, toModelDefinitions } from '../normalizers.js';
import { buildOpenAiChatBody, mapOpenAiChatCompletion } from './openai-compat.js';
import type { AiProviderPort, AiProviderType } from '../ports.js';
import type {
  ChatCompletion,
  ChatRequest,
  ChatStreamChunk,
  EmbeddingRequest,
  EmbeddingResult,
  ModelDefinition,
  ProviderCredentials,
  ProviderHealthResult,
  ProviderOptions,
} from '../types.js';

export class OpenRouterAdapter implements AiProviderPort {
  readonly provider: AiProviderType = 'OPENROUTER';
  private readonly baseUrl: string;
  private readonly options: ProviderOptions;

  constructor(
    private readonly credentials: ProviderCredentials,
    options: ProviderOptions = {},
  ) {
    this.baseUrl = credentials.baseUrl ?? 'https://openrouter.ai/api/v1';
    this.options = options;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://botme.local',
      'X-Title': 'Botme',
    };
  }

  async validateKey(): Promise<ProviderHealthResult> {
    try {
      await fetchJson<{ data: unknown[] }>(`${this.baseUrl}/models`, {
        headers: this.headers(),
        timeoutMs: 15_000,
        maxRetries: 1,
        fetchImpl: this.options.fetchImpl,
      });
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, message: err instanceof Error ? err.message : 'Validation failed' };
    }
  }

  async listModels(): Promise<ModelDefinition[]> {
    const res = await fetchJson<{ data: unknown[] }>(`${this.baseUrl}/models`, {
      headers: this.headers(),
      fetchImpl: this.options.fetchImpl,
    });
    return toModelDefinitions(
      normalizeOpenRouterModels(res as Parameters<typeof normalizeOpenRouterModels>[0]),
    );
  }

  async chat(request: ChatRequest): Promise<ChatCompletion> {
    const res = await fetchJson<OpenRouterChatResponse>(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: this.buildChatBody(request, false),
      signal: request.signal,
      fetchImpl: this.options.fetchImpl,
    });
    return mapOpenAiChatCompletion(res);
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    for await (const data of fetchSSE(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: this.buildChatBody(request, true),
      signal: request.signal,
      fetchImpl: this.options.fetchImpl,
    })) {
      const parsed = JSON.parse(data) as OpenRouterChatStreamResponse;
      const choice = parsed.choices?.[0];
      if (!choice) continue;
      yield {
        id: parsed.id,
        model: parsed.model,
        delta: choice.delta?.content ?? '',
        finishReason: choice.finish_reason,
        usage: parsed.usage
          ? {
              promptTokens: parsed.usage.prompt_tokens,
              completionTokens: parsed.usage.completion_tokens,
              totalTokens: parsed.usage.total_tokens,
            }
          : undefined,
      };
    }
  }

  async embeddings(request: EmbeddingRequest): Promise<EmbeddingResult> {
    const res = await fetchJson<OpenRouterEmbeddingResponse>(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: this.headers(),
      body: { model: request.model, input: request.input },
      signal: request.signal,
      fetchImpl: this.options.fetchImpl,
    });
    return {
      model: res.model,
      embeddings: res.data.map((d) => d.embedding),
      usage: {
        promptTokens: res.usage?.prompt_tokens ?? 0,
        totalTokens: res.usage?.total_tokens ?? 0,
      },
    };
  }

  private buildChatBody(request: ChatRequest, stream: boolean): Record<string, unknown> {
    return buildOpenAiChatBody(request, stream);
  }
}

interface OpenRouterChatResponse {
  id: string;
  model: string;
  choices: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface OpenRouterChatStreamResponse {
  id: string;
  model: string;
  choices?: Array<{ delta?: { content?: string }; finish_reason: string | null }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface OpenRouterEmbeddingResponse {
  model: string;
  data: Array<{ embedding: number[] }>;
  usage?: { prompt_tokens: number; total_tokens: number };
}
