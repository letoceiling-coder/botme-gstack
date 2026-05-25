import { z } from 'zod';

export const WidgetInitSchema = z.object({
  visitorId: z.string().min(8).max(64).optional(),
  conversationId: z.string().cuid().optional(),
});

export const WidgetMessageSchema = z.object({
  conversationId: z.string().cuid(),
  content: z.string().min(1).max(8000),
});

export const WidgetCancelSchema = z.object({
  conversationId: z.string().cuid(),
  streamId: z.string().uuid(),
});

export type WidgetInitInput = z.infer<typeof WidgetInitSchema>;
export type WidgetMessageInput = z.infer<typeof WidgetMessageSchema>;
export type WidgetCancelInput = z.infer<typeof WidgetCancelSchema>;

export interface WidgetMessageDto {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  createdAt: string;
  author?: 'visitor' | 'ai' | 'operator';
}

export interface WidgetSessionDto {
  visitorId: string;
  conversationId: string;
  assistant: {
    name: string;
    welcomeMessage: string;
    placeholder: string;
    avatarUrl?: string | null;
  };
  theme: import('./widget-theme.js').WidgetThemeConfig;
  runtimeSettings: {
    typingSimulation: boolean;
    streamingEnabled: boolean;
    fallbackMessage: string;
  };
  messages: WidgetMessageDto[];
}

export interface WidgetPublicInitDto {
  publicKey: string;
  widgetOrigin: string;
  embedPath: string;
  theme: import('./widget-theme.js').WidgetThemeConfig;
  assistant: {
    name: string;
    welcomeMessage: string;
  };
}

export interface WidgetStartedEvent {
  type: 'widget:started';
  conversationId: string;
  streamId: string;
}

export interface WidgetStreamResetEvent {
  type: 'widget:stream-reset';
  conversationId: string;
  streamId: string;
}

export interface WidgetChunkEvent {
  type: 'widget:chunk';
  conversationId: string;
  streamId: string;
  delta: string;
  meta?: import('./realtime-envelope.js').RealtimeEventMeta;
}

export interface WidgetDoneEvent {
  type: 'widget:done';
  conversationId: string;
  streamId: string;
  messageId: string;
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
  };
}

export interface WidgetErrorEvent {
  type: 'widget:error';
  conversationId: string;
  streamId: string;
  message: string;
  retryable: boolean;
}

export interface WidgetTypingEvent {
  type: 'widget:typing';
  conversationId: string;
  active: boolean;
}

export interface WidgetSessionEvent {
  type: 'widget:session';
  session: WidgetSessionDto;
}
