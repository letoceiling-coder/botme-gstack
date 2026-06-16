import { z } from 'zod';

/** Preset OpenRouter failover chain: free → cheap OpenAI → DeepSeek → Qwen */
export const OPENROUTER_DEFAULT_MODEL_CHAIN = [
  'openrouter/free',
  'openai/gpt-4o-mini',
  'deepseek/deepseek-chat-v3-0324',
  'qwen/qwen-2.5-7b-instruct',
] as const;

export const IntegrationModelChainItemSchema = z.object({
  modelId: z.string().min(1, 'Укажите model id').max(200),
  enabled: z.boolean().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  timeoutMs: z.number().int().min(1000).max(600_000).optional(),
});

export type IntegrationModelChainItemInput = z.infer<typeof IntegrationModelChainItemSchema>;

export interface IntegrationModelChainItemDto {
  position: number;
  modelId: string;
  enabled: boolean;
  maxRetries: number;
  timeoutMs: number;
}

const BaseIntegrationSchema = z.object({
  name: z.string().min(1, 'Укажите название').max(120),
  isDefault: z.boolean().optional(),
  /** Пустой массив или отсутствие = любая доступная модель при failover */
  modelChain: z.array(IntegrationModelChainItemSchema).max(20).optional(),
});

export const CreateIntegrationSchema = z.discriminatedUnion('provider', [
  BaseIntegrationSchema.extend({
    provider: z.literal('OPENAI'),
    apiKey: z.string().min(8, 'API-ключ слишком короткий').max(512),
  }),
  BaseIntegrationSchema.extend({
    provider: z.literal('OPENROUTER'),
    apiKey: z.string().min(8, 'API-ключ слишком короткий').max(512),
  }),
  BaseIntegrationSchema.extend({
    provider: z.literal('OLLAMA_NEEKLO'),
  }),
]);

export type CreateIntegrationInput = z.infer<typeof CreateIntegrationSchema>;

export const IntegrationProviderSchema = z.enum(['OPENAI', 'OPENROUTER', 'OLLAMA_NEEKLO']);
export type IntegrationProvider = z.infer<typeof IntegrationProviderSchema>;

export const UpdateIntegrationSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  isDefault: z.boolean().optional(),
  apiKey: z.string().min(8).max(512).optional(),
  status: z.enum(['ACTIVE', 'INVALID', 'DISABLED', 'PENDING_VALIDATION']).optional(),
  modelChain: z.array(IntegrationModelChainItemSchema).max(20).optional(),
});

export type UpdateIntegrationInput = z.infer<typeof UpdateIntegrationSchema>;

export interface IntegrationDto {
  id: string;
  provider: IntegrationProvider;
  name: string;
  maskedKey: string;
  isDefault: boolean;
  status: string;
  lastValidatedAt: string | null;
  modelCount: number;
  modelChain: IntegrationModelChainItemDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ModelCacheDto {
  id: string;
  externalId: string;
  displayName: string;
  contextWindow: number;
  promptPrice: string | null;
  completionPrice: string | null;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
  isFree: boolean;
  syncedAt: string;
}

export interface ValidateIntegrationResult {
  ok: boolean;
  status: string;
  message?: string;
}

export interface SyncModelsResult {
  queued: boolean;
  jobId?: string;
  synced?: number;
}
