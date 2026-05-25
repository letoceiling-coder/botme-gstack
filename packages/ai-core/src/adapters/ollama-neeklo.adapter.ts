import { fetchJson, fetchSSE } from '../http-client.js';
import { normalizeOllamaModels, toModelDefinitions } from '../normalizers.js';
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

const DEFAULT_BASE_URL = 'https://ollama.neeklo.ru/v1';

export class OllamaNeekloAdapter implements AiProviderPort {
  readonly provider: AiProviderType = 'OLLAMA_NEEKLO';
  private readonly baseUrl: string;
  private readonly options: ProviderOptions;
  private embeddingsSupported: boolean | null = null;

  constructor(
    private readonly credentials: ProviderCredentials,
    options: ProviderOptions = {},
  ) {
    this.baseUrl = (credentials.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.options = options;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.credentials.apiKey) {
      headers['Authorization'] = `Bearer ${this.credentials.apiKey}`;
    }
    return headers;
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
    const res = await fetchJson<{ data: Array<{ id: string; owned_by?: string }> }>(
      `${this.baseUrl}/models`,
      { headers: this.headers(), fetchImpl: this.options.fetchImpl },
    );
    return toModelDefinitions(normalizeOllamaModels(res));
  }

  async chat(request: ChatRequest): Promise<ChatCompletion> {
    const res = await fetchJson<OpenAiChatResponse>(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: this.buildChatBody(request, false),
      signal: request.signal,
      timeoutMs: 120_000,
      maxRetries: 1,
      fetchImpl: this.options.fetchImpl,
    });
    return mapOpenAiChatCompletion(res);
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const body = this.buildChatBody(request, true);
    for await (const data of fetchSSE(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body,
      signal: request.signal,
      fetchImpl: this.options.fetchImpl,
    })) {
      const parsed = JSON.parse(data) as OpenAiChatStreamResponse;
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
    const supported = await this.detectEmbeddingsSupport();
    if (!supported) {
      throw new Error('Embeddings не поддерживаются этим провайдером');
    }
    const res = await fetchJson<OpenAiEmbeddingResponse>(`${this.baseUrl}/embeddings`, {
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
        promptTokens: res.usage.prompt_tokens,
        totalTokens: res.usage.total_tokens,
      },
    };
  }

  private async detectEmbeddingsSupport(): Promise<boolean> {
    if (this.embeddingsSupported !== null) return this.embeddingsSupported;
    try {
      const models = await this.listModels();
      this.embeddingsSupported = models.some((m) =>
        m.externalId.toLowerCase().includes('embed'),
      );
      if (!this.embeddingsSupported) {
        await fetchJson(`${this.baseUrl}/embeddings`, {
          method: 'POST',
          headers: this.headers(),
          body: { model: 'nomic-embed-text', input: 'ping' },
          timeoutMs: 8_000,
          maxRetries: 0,
          fetchImpl: this.options.fetchImpl,
        });
        this.embeddingsSupported = true;
      }
    } catch {
      this.embeddingsSupported = false;
    }
    return this.embeddingsSupported;
  }

  private buildChatBody(request: ChatRequest, stream: boolean): Record<string, unknown> {
    return buildOpenAiChatBody(request, stream);
  }
}

interface OpenAiChatResponse {
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
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface OpenAiChatStreamResponse {
  id: string;
  model: string;
  choices?: Array<{ delta?: { content?: string }; finish_reason: string | null }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface OpenAiEmbeddingResponse {
  model: string;
  data: Array<{ embedding: number[] }>;
  usage: { prompt_tokens: number; total_tokens: number };
}
