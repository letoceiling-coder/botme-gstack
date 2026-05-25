import type {
  AiProviderType,
  ChatCompletion,
  ChatMessage,
  ChatRequest,
  ChatStreamChunk,
  EmbeddingRequest,
  EmbeddingResult,
  ModelDefinition,
  ProviderHealthResult,
} from './types.js';

export type { AiProviderType, ModelDefinition } from './types.js';
export type {
  ChatCompletion,
  ChatMessage,
  ChatRequest,
  ChatStreamChunk,
  EmbeddingRequest,
  EmbeddingResult,
  NormalizedModel,
  ProviderCredentials,
  ProviderHealthResult,
  ProviderOptions,
  TokenUsage,
} from './types.js';

export interface AiProviderPort {
  readonly provider: AiProviderType;
  validateKey(): Promise<ProviderHealthResult>;
  listModels(): Promise<ModelDefinition[]>;
  chat(request: ChatRequest): Promise<ChatCompletion>;
  chatStream(request: ChatRequest): AsyncIterable<ChatStreamChunk>;
  embeddings(request: EmbeddingRequest): Promise<EmbeddingResult>;
}
