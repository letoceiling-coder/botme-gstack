import { z } from 'zod';

export const AgentStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

export const AgentModelFallbackInputSchema = z.object({
  integrationId: z.string().cuid(),
  modelId: z.string().min(1).max(200),
  enabled: z.boolean().optional(),
  maxRetries: z.number().int().min(0).max(5).optional(),
  timeoutMs: z.number().int().min(5000).max(300000).optional(),
});

export const CreateAgentSchema = z.object({
  name: z.string().min(1, 'Укажите название').max(120),
  description: z.string().max(2000).optional(),
  integrationId: z.string().cuid(),
  modelId: z.string().min(1).max(200),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().min(1).max(128000).optional(),
  systemPrompt: z.string().min(1, 'Укажите системный промпт').max(32000),
  fallbacks: z.array(AgentModelFallbackInputSchema).max(10).optional(),
});

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  integrationId: z.string().cuid().optional(),
  modelId: z.string().min(1).max(200).optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().min(1).max(128000).optional(),
  status: AgentStatusSchema.optional(),
  streamingEnabled: z.boolean().optional(),
  toolsEnabled: z.boolean().optional(),
  fallbacks: z.array(AgentModelFallbackInputSchema).max(10).optional(),
});

export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;

export const CreatePromptVersionSchema = z.object({
  content: z.string().min(1, 'Промпт не может быть пустым').max(32000),
  activate: z.boolean().optional(),
});

export type CreatePromptVersionInput = z.infer<typeof CreatePromptVersionSchema>;

export interface AgentModelFallbackDto {
  id: string;
  position: number;
  integrationId: string;
  modelId: string;
  enabled: boolean;
  maxRetries: number;
  timeoutMs: number;
}

export interface AgentRuntimeDiagnosticsDto {
  agentId: string;
  chain: Array<{
    position: number;
    integrationId: string;
    modelId: string;
    provider: string;
    enabled: boolean;
    isFree: boolean;
    supportsTools: boolean;
    health: {
      lastSuccessAt: number | null;
      lastFailureAt: number | null;
      consecutiveFailures: number;
      avgLatencyMs: number;
      cooldownUntil: number | null;
    } | null;
  }>;
  lastUsedModelId: string | null;
  lastFailoverReason: string | null;
  lastUsedAt: string | null;
}

export interface AgentDto {
  id: string;
  name: string;
  description: string;
  integrationId: string;
  integrationName: string;
  modelId: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  systemPrompt: string;
  status: string;
  streamingEnabled: boolean;
  toolsEnabled: boolean;
  activePromptVersionId: string | null;
  activeVersion: number | null;
  fallbacks: AgentModelFallbackDto[];
  createdAt: string;
  updatedAt: string;
}

export interface PromptVersionDto {
  id: string;
  version: number;
  content: string;
  createdBy: string;
  createdByName: string;
  isActive: boolean;
  createdAt: string;
}

export interface AgentDetailDto extends AgentDto {
  promptVersions: PromptVersionDto[];
}
