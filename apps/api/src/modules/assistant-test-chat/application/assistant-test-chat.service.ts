import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AiProviderType } from '@botme/database';
import { Prisma } from '@botme/database';
import type { AssistantRuntimeSnapshotDto, CitationDto } from '@botme/shared';
import type { AssistantChatSessionDto } from '@botme/shared';
import {
  OrchestratorError,
  type OrchestratorMessage,
} from '@botme/ai-core';
import { IntegrationCredentialsService } from '../../../core/security/integration-credentials.service';
import { ProviderCredentialsResolver } from '../../../core/config/provider-credentials.resolver';
import { IntegrationRepository } from '../../foundation/infrastructure/integration.repository';
import { AssistantRuntimeResolver } from '../../assistant/application/assistant-runtime.resolver';
import { AssistantRepository } from '../../assistant/infrastructure/assistant.repository';
import {
  ConversationRepository,
  type ConversationWithMessages,
} from '../../widget-chat/infrastructure/conversation.repository';
import { RagRetrievalService } from '../../knowledge/application/rag-retrieval.service';
import { ToolRuntimeService } from '../../tool/application/tool-runtime.service';
import { AssistantTestStreamRegistry } from './assistant-test-stream-registry';

const STREAM_TIMEOUT_MS = 120_000;

export interface AssistantTestStreamCallbacks {
  onChunk: (delta: string, streamId: string) => void;
  onDone: (payload: {
    streamId: string;
    messageId: string;
    content: string;
    citations: CitationDto[];
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
export class AssistantTestChatService {
  private readonly logger = new Logger(AssistantTestChatService.name);

  constructor(
    private readonly conversations: ConversationRepository,
    private readonly assistants: AssistantRepository,
    private readonly runtimeResolver: AssistantRuntimeResolver,
    private readonly integrations: IntegrationRepository,
    private readonly credentials: IntegrationCredentialsService,
    private readonly providerCredentials: ProviderCredentialsResolver,
    private readonly streams: AssistantTestStreamRegistry,
    private readonly rag: RagRetrievalService,
    private readonly toolRuntime: ToolRuntimeService,
  ) {}

  async getOrCreateSession(
    workspaceId: string,
    assistantId: string,
    userId: string,
  ): Promise<AssistantChatSessionDto> {
    const assistant = await this.assistants.findById(workspaceId, assistantId);
    if (!assistant) throw new NotFoundException('Ассистент не найден');

    let conversation = await this.conversations.findOpenAdminTest(
      workspaceId,
      assistantId,
      userId,
    );

    if (!conversation) {
      const snapshot = await this.runtimeResolver.resolve(workspaceId, assistantId, true);
      const created = await this.conversations.create({
        workspace: { connect: { id: workspaceId } },
        assistant: { connect: { id: assistantId } },
        snapshot: { connect: { id: snapshot.snapshotId } },
        visitorId: `admin:${userId}`,
        status: 'OPEN',
        lastMessageAt: new Date(),
      });
      conversation = await this.conversations.findById(workspaceId, created.id);
      if (!conversation) throw new NotFoundException('Сессия не создана');
    }

    const pinned = await this.loadPinnedSnapshot(workspaceId, conversation.snapshotId);
    return this.toSessionDto(conversation, pinned);
  }

  async startMessage(
    workspaceId: string,
    userId: string,
    assistantId: string,
    conversationId: string | undefined,
    content: string,
    socketId: string,
    callbacks: AssistantTestStreamCallbacks,
  ): Promise<{ conversationId: string; streamId: string }> {
    const session = conversationId
      ? await this.conversations.findById(workspaceId, conversationId)
      : null;

    let conversation = session;
    if (
      !conversation ||
      conversation.assistantId !== assistantId ||
      conversation.visitorId !== `admin:${userId}` ||
      conversation.status !== 'OPEN'
    ) {
      const dto = await this.getOrCreateSession(workspaceId, assistantId, userId);
      conversation = await this.conversations.findById(workspaceId, dto.conversationId);
    }

    if (!conversation) throw new NotFoundException('Диалог не найден');

    if (this.streams.hasActive(conversation.id)) {
      throw new BadRequestException('Ответ уже генерируется');
    }

    const pinned = await this.loadPinnedSnapshot(workspaceId, conversation.snapshotId);
    const integration = await this.integrations.findById(workspaceId, pinned.integration.id);
    if (!integration || integration.status !== 'ACTIVE') {
      throw new BadRequestException('Интеграция недоступна');
    }

    await this.conversations.addMessage({
      conversation: { connect: { id: conversation.id } },
      workspace: { connect: { id: workspaceId } },
      role: 'USER',
      content,
    });
    await this.conversations.touchConversation(conversation.id);

    const history = this.buildHistory(
      conversation.messages,
      pinned.runtimeSettings.maxContextMessages,
    );
    const streamId = randomUUID();
    const controller = this.streams.register(streamId, conversation.id, userId, socketId);
    const timeout = AbortSignal.timeout(STREAM_TIMEOUT_MS);
    const signal = AbortSignal.any([controller.signal, timeout]);

    const { apiKey } = this.credentials.decryptApiKey(
      { encryptedSecret: integration.encryptedSecret, keyVersion: integration.keyVersion },
      workspaceId,
    );
    const resolved = this.providerCredentials.resolveForIntegration(integration.provider, apiKey);

    this.logger.log(
      `assistant chat start conversation=${conversation.id} assistant=${assistantId}`,
    );

    void this.runStream({
      streamId,
      conversationId: conversation.id,
      workspaceId,
      assistantId,
      visitorId: conversation.visitorId,
      pinned,
      provider: integration.provider,
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
      history,
      userMessage: content,
      signal,
      callbacks,
    });

    return { conversationId: conversation.id, streamId };
  }

  cancelConversation(conversationId: string): number {
    return this.streams.cancelByConversation(conversationId);
  }

  cancelForUser(userId: string): number {
    return this.streams.cancelAllForUser(userId);
  }

  async clearSession(
    workspaceId: string,
    assistantId: string,
    userId: string,
  ): Promise<{ ok: true }> {
    const conversation = await this.conversations.findOpenAdminTest(
      workspaceId,
      assistantId,
      userId,
    );
    if (conversation) {
      this.streams.cancelByConversation(conversation.id);
      await this.conversations.closeConversation(conversation.id);
    }
    return { ok: true };
  }

  private async runStream(params: {
    streamId: string;
    conversationId: string;
    workspaceId: string;
    assistantId: string;
    visitorId: string;
    pinned: PinnedSnapshot;
    provider: AiProviderType;
    apiKey: string;
    baseUrl?: string;
    history: OrchestratorMessage[];
    userMessage: string;
    signal: AbortSignal;
    callbacks: AssistantTestStreamCallbacks;
  }): Promise<void> {
    const { streamId, conversationId, callbacks, signal, pinned } = params;
    let citations: CitationDto[] = [];
    const started = Date.now();

    try {
      let systemPrompt = params.pinned.promptVersion.content;
      if (pinned.runtimeSettings.citationsEnabled && pinned.knowledgeBases.length > 0) {
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
      });

      let content = '';
      let result = await generator.next();
      while (!result.done) {
        if (result.value.delta) {
          content += result.value.delta;
          callbacks.onChunk(result.value.delta, streamId);
        }
        result = await generator.next();
      }

      const final = result.value;
      content = final.content || content;
      const latencyMs = Date.now() - started;

      const saved = await this.conversations.addMessage({
        conversation: { connect: { id: conversationId } },
        workspace: { connect: { id: params.workspaceId } },
        role: 'ASSISTANT',
        content,
        latencyMs,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        toolCalls: final.toolUsed
          ? ({ type: final.toolType, ok: final.toolResult?.ok } as Prisma.InputJsonValue)
          : undefined,
        citations:
          citations.length > 0 ? (citations as unknown as Prisma.InputJsonValue) : undefined,
      });
      await this.conversations.touchConversation(conversationId);

      callbacks.onDone({
        streamId,
        messageId: saved.id,
        content,
        citations,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          latencyMs,
        },
      });
    } catch (err: unknown) {
      if (signal.aborted) {
        callbacks.onError({ streamId, message: 'Генерация отменена', retryable: false });
      } else if (err instanceof OrchestratorError) {
        callbacks.onError({ streamId, message: err.message, retryable: err.retryable });
      } else {
        callbacks.onError({
          streamId,
          message: pinned.runtimeSettings.fallbackMessage,
          retryable: false,
        });
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
    if (!row) throw new NotFoundException('Runtime snapshot не найден');
    return structuredClone(row.snapshot as unknown as PinnedSnapshot);
  }

  private buildHistory(
    messages: ConversationWithMessages['messages'],
    maxContextMessages: number,
  ): OrchestratorMessage[] {
    const relevant = messages.filter((m) => m.role === 'USER' || m.role === 'ASSISTANT');
    return relevant.slice(-maxContextMessages).map((m) => ({
      role: m.role === 'USER' ? 'user' : 'assistant',
      content: m.content,
    }));
  }

  private toSessionDto(
    conversation: ConversationWithMessages,
    pinned: PinnedSnapshot,
  ): AssistantChatSessionDto {
    return {
      conversationId: conversation.id,
      assistantId: conversation.assistantId,
      snapshotId: conversation.snapshotId,
      messages: conversation.messages
        .filter((m) => m.role === 'USER' || m.role === 'ASSISTANT' || m.role === 'SYSTEM')
        .map((m) => ({
          id: m.id,
          role: m.role as 'USER' | 'ASSISTANT' | 'SYSTEM',
        content: m.content,
        citations: m.citations as unknown as AssistantChatSessionDto['messages'][number]['citations'],
        latencyMs: m.latencyMs,
        createdAt: m.createdAt.toISOString(),
      })),
      runtime: {
        assistantName: pinned.assistant.name,
        modelId: pinned.agent.modelId,
        provider: pinned.integration.provider,
        knowledgeBaseCount: pinned.knowledgeBases.length,
        toolCount: pinned.tools.length,
      },
    };
  }
}
