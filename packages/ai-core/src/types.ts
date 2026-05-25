export type AiProviderType =
  | 'OPENAI'
  | 'OPENROUTER'
  | 'ANTHROPIC'
  | 'GEMINI'
  | 'OLLAMA'
  | 'OLLAMA_NEEKLO'
  | 'GROQ'
  | 'DEEPSEEK'
  | 'TOGETHER'
  | 'MISTRAL';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  toolCallId?: string;
  toolCalls?: ProviderToolCall[];
}

export interface ProviderToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ProviderToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
  tools?: ProviderToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
}

export interface ChatCompletion {
  id: string;
  model: string;
  content: string;
  finishReason: string | null;
  usage: TokenUsage;
  toolCalls?: ProviderToolCall[];
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatStreamChunk {
  id: string;
  model: string;
  delta: string;
  finishReason: string | null;
  usage?: TokenUsage;
}

export interface EmbeddingRequest {
  model: string;
  input: string[];
  signal?: AbortSignal;
}

export interface EmbeddingResult {
  model: string;
  embeddings: number[][];
  usage: { promptTokens: number; totalTokens: number };
}

export interface ProviderHealthResult {
  ok: boolean;
  message?: string;
}

export interface ModelDefinition {
  externalId: string;
  displayName: string;
  contextWindow: number;
  promptPrice: number | null;
  completionPrice: number | null;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
  isFree: boolean;
}

export interface ProviderCredentials {
  apiKey: string;
  baseUrl?: string;
}

export interface ProviderOptions {
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export interface NormalizedModel {
  externalId: string;
  provider: AiProviderType;
  displayName: string;
  contextWindow: number;
  promptPrice: number | null;
  completionPrice: number | null;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
  isFree: boolean;
}
