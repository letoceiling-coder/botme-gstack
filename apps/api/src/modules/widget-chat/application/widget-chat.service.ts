import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AiProviderType } from '@botme/database';
import { Prisma } from '@botme/database';
import type { AssistantRuntimeSnapshotDto } from '@botme/shared';
import {
  OrchestratorError,
  type OrchestratorMessage,
} from '@botme/ai-core';
import type { WidgetInitInput, WidgetMessageDto, WidgetSessionDto } from '@botme/shared';
import { normalizeLauncherConfig, type WidgetThemeConfig } from '@botme/shared';
import { IntegrationCredentialsService } from '../../../core/security/integration-credentials.service';
import { IntegrationRepository } from '../../foundation/infrastructure/integration.repository';
import { WidgetRepository } from '../../foundation/infrastructure/widget.repository';
import { AssistantRuntimeResolver } from '../../assistant/application/assistant-runtime.resolver';
import { AssistantRepository } from '../../assistant/infrastructure/assistant.repository';
import type { WidgetSessionContext } from '../../foundation/application/widget-auth.service';
import {
  ConversationRepository,
  type ConversationWithMessages,
} from '../infrastructure/conversation.repository';
import { WidgetStreamRegistry } from './widget-stream-registry';
import { RagRetrievalService } from '../../knowledge/application/rag-retrieval.service';
import { ToolRuntimeService } from '../../tool/application/tool-runtime.service';
import type { CitationDto } from '@botme/shared';
import { StreamRuntime } from '@botme/ai-runtime';

const STREAM_TIMEOUT_MS = 120_000;

export interface WidgetStreamCallbacks {
  onStarted: (streamId: string) => void;
  onChunk: (delta: string, streamId: string) => void;
  onStreamReset?: (streamId: string) => void;
  onTyping: (active: boolean) => void;
  onUserMessage?: (message: WidgetMessageDto) => void;
  onAssistantMessage?: (message: WidgetMessageDto) => void;
  onDone: (payload: {
    streamId: string;
    messageId: string;
    content: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      latencyMs: number;
    };
  }) => void;
  onError: (payload: { streamId: string; message: string; retryable: boolean }) => void;
}

type PinnedSnapshot = Omit<AssistantRuntimeSnapshotDto, 'snapshotId' | 'assistantId' | 'resolvedAt'>;

@Injectable()
export class WidgetChatService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly assistants: AssistantRepository,
    private readonly runtimeResolver: AssistantRuntimeResolver,
    private readonly integrations: IntegrationRepository,
    private readonly credentials: IntegrationCredentialsService,
    private readonly streams: WidgetStreamRegistry,
    private readonly rag: RagRetrievalService,
    private readonly toolRuntime: ToolRuntimeService,
    private readonly widgets: WidgetRepository,
  ) {}

  async initSession(
    ctx: WidgetSessionContext,
    input: WidgetInitInput,
  ): Promise<WidgetSessionDto> {
    const visitorId = input.visitorId?.trim() || randomUUID();

    let conversation: ConversationWithMessages | null = null;

    if (input.conversationId) {
      conversation = await this.conversations.findById(ctx.workspaceId, input.conversationId);
      if (
        !conversation ||
        conversation.widgetId !== ctx.widgetId ||
        conversation.visitorId !== visitorId ||
        conversation.assistantId !== ctx.assistantId
      ) {
        throw new NotFoundException('Диалог не найден');
      }
    } else {
      conversation = await this.conversations.findOpenForVisitor(
        ctx.workspaceId,
        ctx.widgetId,
        visitorId,
      );
    }

    if (!conversation) {
      const snapshot = await this.runtimeResolver.resolve(
        ctx.workspaceId,
        ctx.assistantId,
        true,
      );
      const created = await this.conversations.create({
        workspace: { connect: { id: ctx.workspaceId } },
        assistant: { connect: { id: ctx.assistantId } },
        widget: { connect: { id: ctx.widgetId } },
        snapshot: { connect: { id: snapshot.snapshotId } },
        visitorId,
        status: 'OPEN',
        lastMessageAt: new Date(),
      });
      conversation = await this.conversations.findById(ctx.workspaceId, created.id);
      if (!conversation) throw new NotFoundException('Диалог не создан');
    }

    const pinned = await this.loadPinnedSnapshot(ctx.workspaceId, conversation.snapshotId);
    const widgetRow = await this.widgets.findByIdScoped(ctx.workspaceId, ctx.widgetId);
    const theme = this.buildTheme(widgetRow?.launcherConfig, pinned);
    return this.toSessionDto(visitorId, conversation, pinned, theme);
  }

  async startMessage(
    ctx: WidgetSessionContext,
    conversationId: string,
    content: string,
    socketId: string,
    callbacks: WidgetStreamCallbacks,
  ): Promise<{ streamId: string }> {
    const conversation = await this.conversations.findById(ctx.workspaceId, conversationId);
    if (
      !conversation ||
      conversation.widgetId !== ctx.widgetId ||
      conversation.assistantId !== ctx.assistantId ||
      conversation.status !== 'OPEN'
    ) {
      throw new NotFoundException('Диалог не найден');
    }

    if (this.streams.hasActive(conversationId)) {
      throw new BadRequestException('Ответ уже генерируется');
    }

    const pinned = await this.loadPinnedSnapshot(ctx.workspaceId, conversation.snapshotId);
    const integration = await this.integrations.findById(
      ctx.workspaceId,
      pinned.integration.id,
    );
    if (!integration || integration.status !== 'ACTIVE') {
      throw new BadRequestException('Интеграция недоступна');
    }

    const savedUser = await this.conversations.addMessage({
      conversation: { connect: { id: conversationId } },
      workspace: { connect: { id: ctx.workspaceId } },
      role: 'USER',
      content,
    });
    await this.conversations.touchConversation(conversationId);
    callbacks.onUserMessage?.(this.toMessageDto(savedUser));

    const history = this.buildHistory(conversation.messages, pinned.runtimeSettings.maxContextMessages);
    const streamId = randomUUID();
    const controller = this.streams.register(
      streamId,
      conversationId,
      conversation.visitorId,
      ctx.widgetId,
      socketId,
    );

    const timeout = AbortSignal.timeout(STREAM_TIMEOUT_MS);
    const signal = AbortSignal.any([controller.signal, timeout]);

    callbacks.onStarted(streamId);
    if (pinned.runtimeSettings.typingSimulation) {
      callbacks.onTyping(true);
    }

    const { apiKey } = this.credentials.decryptApiKey(
      { encryptedSecret: integration.encryptedSecret, keyVersion: integration.keyVersion },
      ctx.workspaceId,
    );

    void this.runStream({
      streamId,
      conversationId,
      workspaceId: ctx.workspaceId,
      assistantId: ctx.assistantId,
      visitorId: conversation.visitorId,
      pinned,
      provider: integration.provider,
      history,
      userMessage: content,
      apiKey,
      signal,
      callbacks,
    });

    return { streamId };
  }

  cancelStream(conversationId: string, streamId: string): boolean {
    const active = this.streams.getActiveStreamId(conversationId);
    if (active !== streamId) return false;
    return this.streams.cancel(streamId);
  }

  cancelForDisconnect(socketId: string): number {
    return this.streams.cancelAllForSocket(socketId);
  }

  private async runStream(params: {
    streamId: string;
    conversationId: string;
    workspaceId: string;
    assistantId: string;
    visitorId: string;
    pinned: PinnedSnapshot;
    provider: AiProviderType;
    history: OrchestratorMessage[];
    userMessage: string;
    apiKey: string;
    signal: AbortSignal;
    callbacks: WidgetStreamCallbacks;
  }): Promise<void> {
    const { streamId, conversationId, callbacks, signal, pinned } = params;
    let citations: CitationDto[] = [];
    const started = Date.now();
    const streamRuntime = new StreamRuntime({
      streamId,
      signal,
      callbacks: {
        onChunk: (delta: string) => callbacks.onChunk(delta, streamId),
        onReset: () => callbacks.onStreamReset?.(streamId),
      },
    });

    try {
      let systemPrompt = params.pinned.promptVersion.content;
      if (
        pinned.runtimeSettings.citationsEnabled &&
        pinned.knowledgeBases.length > 0
      ) {
        const rag = await this.rag.retrieve({
          workspaceId: params.workspaceId,
          knowledgeBaseIds: pinned.knowledgeBases.map((kb) => kb.id),
          query: params.userMessage,
          baseSystemPrompt: systemPrompt,
        });
        systemPrompt = rag.systemPrompt;
        citations = rag.citations;
      }

      const generator = this.toolRuntime.streamWithTools({
        agentId: params.pinned.agent.id,
        systemPrompt,
        temperature: params.pinned.agent.temperature,
        topP: params.pinned.agent.topP,
        maxTokens: params.pinned.agent.maxTokens,
        history: params.history,
        userMessage: params.userMessage,
        pinnedTools: pinned.tools,
        workspaceId: params.workspaceId,
        assistantId: params.assistantId,
        conversationId,
        visitorId: params.visitorId,
        knowledgeBaseIds: pinned.knowledgeBases.map((kb) => kb.id),
        signal,
        onStreamReset: () => streamRuntime.reset(),
      });

      let content = '';
      let result = await generator.next();
      while (!result.done) {
        if (result.value.delta) {
          streamRuntime.pushChunk(result.value.delta);
          content = streamRuntime.contentSnapshot;
        }
        result = await generator.next();
      }

      callbacks.onTyping(false);
      const final = result.value;
      content = final.content || content;
      const latencyMs = Date.now() - started;

      const saved = await this.conversations.addMessage({
        conversation: { connect: { id: conversationId } },
        workspace: { connect: { id: params.workspaceId } },
        role: 'ASSISTANT',
        content,
        latencyMs,
        tokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
        toolCalls: final.toolUsed
          ? ({ type: final.toolType, ok: final.toolResult?.ok } as Prisma.InputJsonValue)
          : undefined,
        citations:
          citations.length > 0 ? (citations as unknown as Prisma.InputJsonValue) : undefined,
      });
      await this.conversations.touchConversation(conversationId);

      callbacks.onAssistantMessage?.(this.toMessageDto(saved));

      callbacks.onDone({
        streamId,
        messageId: saved.id,
        content,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          latencyMs,
        },
      });
    } catch (err: unknown) {
      callbacks.onTyping(false);
      if (signal.aborted) {
        callbacks.onError({ streamId, message: 'Генерация отменена', retryable: false });
      } else if (err instanceof OrchestratorError) {
        callbacks.onError({ streamId, message: err.message, retryable: err.retryable });
      } else {
        callbacks.onError({ streamId, message: pinned.runtimeSettings.fallbackMessage, retryable: false });
      }
    } finally {
      this.streams.remove(streamId);
    }
  }

  private async loadPinnedSnapshot(
    workspaceId: string,
    snapshotId: string,
  ): Promise<PinnedSnapshot> {
    const row = await this.assistants.getSnapshotById(workspaceId, snapshotId);
    if (!row) {
      throw new NotFoundException('Runtime snapshot не найден');
    }
    const body = row.snapshot as unknown as PinnedSnapshot;
    return structuredClone(body);
  }

  private buildHistory(
    messages: ConversationWithMessages['messages'],
    maxContextMessages: number,
  ): OrchestratorMessage[] {
    const relevant = messages.filter((m) => m.role === 'USER' || m.role === 'ASSISTANT');
    const trimmed = relevant.slice(-maxContextMessages);
    return trimmed.map((m) => ({
      role: m.role === 'USER' ? 'user' : 'assistant',
      content: m.content,
    }));
  }

  private buildTheme(
    launcherConfig: unknown,
    pinned: PinnedSnapshot,
  ): WidgetThemeConfig {
    const theme = normalizeLauncherConfig(launcherConfig);
    if (!theme.welcomeMessage && pinned.assistant.welcomeMessage) {
      theme.welcomeMessage = pinned.assistant.welcomeMessage;
    }
    if (!theme.widgetTitle) {
      theme.widgetTitle = pinned.assistant.name;
    }
    return theme;
  }

  private toSessionDto(
    visitorId: string,
    conversation: ConversationWithMessages,
    pinned: PinnedSnapshot,
    theme: WidgetThemeConfig,
  ): WidgetSessionDto {
    return {
      visitorId,
      conversationId: conversation.id,
      assistant: {
        name: pinned.assistant.name,
        welcomeMessage: theme.welcomeMessage ?? pinned.assistant.welcomeMessage,
        placeholder: pinned.assistant.placeholder,
        avatarUrl: theme.avatarUrl,
      },
      theme,
      runtimeSettings: {
        typingSimulation: pinned.runtimeSettings.typingSimulation,
        streamingEnabled: pinned.runtimeSettings.streamingEnabled,
        fallbackMessage: pinned.runtimeSettings.fallbackMessage,
      },
      messages: conversation.messages.map((m) => this.toMessageDto(m)),
    };
  }

  private toMessageDto(message: ConversationWithMessages['messages'][number]): WidgetMessageDto {
    const isOperator = message.providerMessageId?.startsWith('operator:') ?? false;
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      author: message.role === 'USER' ? 'visitor' : isOperator ? 'operator' : 'ai',
    };
  }
}
