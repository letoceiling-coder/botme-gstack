import { z } from 'zod';

const BaseIntegrationSchema = z.object({
  name: z.string().min(1, 'Укажите название').max(120),
  isDefault: z.boolean().optional(),
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
