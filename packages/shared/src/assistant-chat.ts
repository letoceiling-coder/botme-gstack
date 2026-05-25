import { z } from 'zod';
import type { CitationDto } from './knowledge.js';

export const AssistantChatStartSchema = z.object({
  assistantId: z.string().cuid(),
  conversationId: z.string().cuid().optional(),
  message: z.string().min(1).max(32000),
});

export type AssistantChatStartInput = z.infer<typeof AssistantChatStartSchema>;

export const AssistantChatCancelSchema = z.object({
  conversationId: z.string().cuid(),
});

export type AssistantChatCancelInput = z.infer<typeof AssistantChatCancelSchema>;

export interface AssistantChatMessageDto {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  citations?: CitationDto[];
  latencyMs: number | null;
  createdAt: string;
}

export interface AssistantChatSessionDto {
  conversationId: string;
  assistantId: string;
  snapshotId: string;
  messages: AssistantChatMessageDto[];
  runtime: {
    assistantName: string;
    modelId: string;
    provider: string;
    knowledgeBaseCount: number;
    toolCount: number;
  };
}

export interface AssistantChatUsageDto {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
}
