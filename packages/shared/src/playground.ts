import { z } from 'zod';

export const PlaygroundStartSchema = z.object({
  sessionId: z.string().cuid().optional(),
  agentId: z.string().cuid(),
  message: z.string().min(1).max(32000),
  promptVersionId: z.string().cuid().optional(),
  forceFailoverIndex: z.number().int().min(1).max(10).optional(),
});

export type PlaygroundStartInput = z.infer<typeof PlaygroundStartSchema>;

export const PlaygroundCancelSchema = z.object({
  sessionId: z.string().cuid(),
});

export type PlaygroundCancelInput = z.infer<typeof PlaygroundCancelSchema>;

export interface PlaygroundUsageDto {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  provider: string;
  model: string;
  failoverFrom?: string;
}

export interface PlaygroundStreamResetEvent {
  type: 'playground:stream-reset';
  sessionId: string;
  streamId: string;
}

export interface PlaygroundMessageDto {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
  createdAt: string;
}

export interface PlaygroundSessionDto {
  id: string;
  agentId: string;
  promptVersionId: string | null;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  lastLatencyMs: number | null;
  lastProvider: string | null;
  lastModel: string | null;
  messages: PlaygroundMessageDto[];
  createdAt: string;
  updatedAt: string;
}

export interface PlaygroundChunkEvent {
  type: 'playground:chunk';
  sessionId: string;
  delta: string;
  streamId: string;
}

export interface PlaygroundDoneEvent {
  type: 'playground:done';
  sessionId: string;
  streamId: string;
  content: string;
  usage: PlaygroundUsageDto;
}

export interface PlaygroundErrorEvent {
  type: 'playground:error';
  sessionId: string;
  streamId: string;
  message: string;
  retryable: boolean;
}

export type PlaygroundStreamEvent =
  | PlaygroundChunkEvent
  | PlaygroundStreamResetEvent
  | PlaygroundDoneEvent
  | PlaygroundErrorEvent;
