import { z } from 'zod';

export const AssistantVisibilitySchema = z.enum(['PUBLIC', 'INTERNAL', 'PRIVATE']);
export const AssistantStatusSchema = z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']);

export const RuntimeSettingsSchema = z.object({
  maxContextMessages: z.number().int().min(1).max(200).optional(),
  memoryEnabled: z.boolean().optional(),
  citationsEnabled: z.boolean().optional(),
  moderationEnabled: z.boolean().optional(),
  fallbackMessage: z.string().max(500).optional(),
  typingSimulation: z.boolean().optional(),
  streamingEnabled: z.boolean().optional(),
  widgetPosition: z.string().max(50).optional(),
  offlineMessage: z.string().max(500).optional().nullable(),
});

export const CreateAssistantSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Slug: только a-z, 0-9, дефис')
    .optional(),
  description: z.string().max(2000).optional(),
  agentId: z.string().cuid(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  welcomeMessage: z.string().max(2000).optional(),
  placeholder: z.string().max(200).optional(),
  tone: z.string().max(50).optional(),
  language: z.string().max(10).optional(),
  visibility: AssistantVisibilitySchema.optional(),
  isActive: z.boolean().optional(),
  runtimeSettings: RuntimeSettingsSchema.optional(),
});

export const UpdateAssistantSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().max(2000).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')).nullable(),
  welcomeMessage: z.string().max(2000).optional(),
  placeholder: z.string().max(200).optional(),
  tone: z.string().max(50).optional(),
  language: z.string().max(10).optional(),
  visibility: AssistantVisibilitySchema.optional(),
  isActive: z.boolean().optional(),
  status: AssistantStatusSchema.optional(),
  runtimeSettings: RuntimeSettingsSchema.optional(),
  behavior: z.record(z.unknown()).optional(),
  escalation: z.record(z.unknown()).optional().nullable(),
});

export const BindAgentSchema = z.object({
  agentId: z.string().cuid(),
});

export const BindKnowledgeBasesSchema = z.object({
  knowledgeBaseIds: z.array(z.string().cuid()),
});

export const BindToolsSchema = z.object({
  toolIds: z.array(z.string().cuid()),
});

export const CreateBindingStubSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

export type CreateAssistantInput = z.infer<typeof CreateAssistantSchema>;
export type UpdateAssistantInput = z.infer<typeof UpdateAssistantSchema>;
export type RuntimeSettingsInput = z.infer<typeof RuntimeSettingsSchema>;

export interface AssistantRuntimeSettingsDto {
  maxContextMessages: number;
  memoryEnabled: boolean;
  citationsEnabled: boolean;
  moderationEnabled: boolean;
  fallbackMessage: string;
  typingSimulation: boolean;
  streamingEnabled: boolean;
  widgetPosition: string;
  language: string;
  offlineMessage: string | null;
}

export interface AssistantDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  agentId: string;
  agentName: string;
  avatarUrl: string | null;
  welcomeMessage: string;
  placeholder: string;
  tone: string;
  language: string;
  isActive: boolean;
  visibility: string;
  status: string;
  knowledgeBaseCount: number;
  toolCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantDetailDto extends AssistantDto {
  runtimeSettings: AssistantRuntimeSettingsDto;
  knowledgeBaseIds: string[];
  toolIds: string[];
  behavior: Record<string, unknown>;
  escalation: Record<string, unknown> | null;
}

export interface KnowledgeBaseBindingDto {
  id: string;
  name: string;
  description: string;
  status: string;
}

export interface ToolBindingDto {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  schema?: Record<string, unknown>;
}

export interface AssistantRuntimeSnapshotDto {
  snapshotId: string;
  assistantId: string;
  resolvedAt: string;
  assistant: {
    id: string;
    name: string;
    slug: string;
    welcomeMessage: string;
    placeholder: string;
    tone: string;
    language: string;
    visibility: string;
    isActive: boolean;
  };
  agent: {
    id: string;
    name: string;
    modelId: string;
    temperature: number;
    topP: number;
    maxTokens: number;
    status: string;
  };
  promptVersion: {
    id: string;
    version: number;
    content: string;
  };
  integration: {
    id: string;
    name: string;
    provider: string;
    status: string;
  };
  knowledgeBases: KnowledgeBaseBindingDto[];
  tools: ToolBindingDto[];
  runtimeSettings: AssistantRuntimeSettingsDto;
}
