import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { PlaygroundSessionDto, PlaygroundStartInput } from '@botme/shared';
import { OrchestratorError, type OrchestratorMessage } from '@botme/ai-core';
import { AgentService } from '../../agent/application/agent.service';
import { AgentModelRuntimeRouter } from '../../agent/application/agent-model-runtime-router.service';
import { AgentRepository } from '../../agent/infrastructure/agent.repository';
import { PlaygroundSessionRepository, type SessionWithMessages } from '../infrastructure/playground-session.repository';
import { StreamRegistry } from './stream-registry';

export interface StreamCallbacks {
  onChunk: (delta: string, streamId: string) => void;
  onStreamReset?: (streamId: string) => void;
  onDone: (payload: {
    streamId: string;
    content: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      latencyMs: number;
      provider: string;
      model: string;
      failoverFrom?: string;
    };
  }) => void;
  onError: (payload: { streamId: string; message: string; retryable: boolean }) => void;
}

@Injectable()
export class PlaygroundStreamService {
  private readonly logger = new Logger(PlaygroundStreamService.name);

  constructor(
    private readonly agents: AgentRepository,
    private readonly agentService: AgentService,
    private readonly modelRouter: AgentModelRuntimeRouter,
    private readonly sessions: PlaygroundSessionRepository,
    private readonly streams: StreamRegistry,
  ) {}

  async getOrCreateSession(
    workspaceId: string,
    userId: string,
    agentId: string,
    sessionId?: string,
  ): Promise<SessionWithMessages> {
    if (sessionId) {
      const existing = await this.sessions.findById(workspaceId, sessionId);
      if (!existing || existing.agentId !== agentId) {
        throw new NotFoundException('Сессия не найдена');
      }
      return existing;
    }

    const active = await this.sessions.findActiveForUser(workspaceId, agentId, userId);
    if (active) return active;

    const created = await this.sessions.create({
      workspace: { connect: { id: workspaceId } },
      agent: { connect: { id: agentId } },
      user: { connect: { id: userId } },
    });

    const loaded = await this.sessions.findById(workspaceId, created.id);
    if (!loaded) throw new NotFoundException('Сессия не найдена');
    return loaded;
  }

  toSessionDto(session: Awaited<ReturnType<PlaygroundSessionRepository['findById']>>): PlaygroundSessionDto {
    if (!session) throw new NotFoundException('Сессия не найдена');
    return {
      id: session.id,
      agentId: session.agentId,
      promptVersionId: session.promptVersionId,
      totalPromptTokens: session.totalPromptTokens,
      totalCompletionTokens: session.totalCompletionTokens,
      totalTokens: session.totalTokens,
      lastLatencyMs: session.lastLatencyMs,
      lastProvider: session.lastProvider,
      lastModel: session.lastModel,
      messages: session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        promptTokens: m.promptTokens,
        completionTokens: m.completionTokens,
        totalTokens: m.totalTokens,
        latencyMs: m.latencyMs,
        createdAt: m.createdAt.toISOString(),
      })),
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  async startStream(
    workspaceId: string,
    userId: string,
    input: PlaygroundStartInput,
    callbacks: StreamCallbacks,
  ): Promise<{ sessionId: string; streamId: string }> {
    const agent = await this.agents.findById(workspaceId, input.agentId);
    if (!agent || agent.status !== 'ACTIVE') {
      throw new NotFoundException('Агент не найден');
    }

    const session = await this.getOrCreateSession(
      workspaceId,
      userId,
      input.agentId,
      input.sessionId,
    );

    const systemPrompt = this.agentService.resolveSystemPrompt(agent, input.promptVersionId);
    const streamId = randomUUID();
    const controller = this.streams.register(streamId, session.id, userId, workspaceId);

    await this.sessions.addMessage({
      session: { connect: { id: session.id } },
      role: 'USER',
      content: input.message,
    });

    const history: OrchestratorMessage[] = session.messages
      .filter((m) => m.role === 'USER' || m.role === 'ASSISTANT')
      .map((m) => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content,
      }));

    void this.runStream({
      streamId,
      sessionId: session.id,
      workspaceId,
      agent,
      systemPrompt,
      history,
      userMessage: input.message,
      promptVersionId: input.promptVersionId ?? agent.activePromptVersionId,
      forceFailoverIndex: input.forceFailoverIndex,
      signal: controller.signal,
      callbacks,
    });

    return { sessionId: session.id, streamId };
  }

  cancelSession(sessionId: string): number {
    return this.streams.cancelBySession(sessionId);
  }

  cancelForDisconnect(userId: string, workspaceId: string): void {
    this.streams.cancelAllForSocket(userId, workspaceId);
  }

  async clearSession(workspaceId: string, sessionId: string): Promise<{ ok: true }> {
    await this.sessions.softClearSession(workspaceId, sessionId);
    this.streams.cancelBySession(sessionId);
    return { ok: true };
  }

  private async runStream(params: {
    streamId: string;
    sessionId: string;
    workspaceId: string;
    agent: NonNullable<Awaited<ReturnType<AgentRepository['findById']>>>;
    systemPrompt: string;
    history: OrchestratorMessage[];
    userMessage: string;
    promptVersionId: string | null;
    forceFailoverIndex?: number;
    signal: AbortSignal;
    callbacks: StreamCallbacks;
  }): Promise<void> {
    const { streamId, sessionId, callbacks, signal } = params;
    let fullContent = '';

    try {
      const gen = this.modelRouter.streamWithFailover(
        {
          workspaceId: params.workspaceId,
          agentId: params.agent.id,
          systemPrompt: params.systemPrompt,
          temperature: params.agent.temperature,
          topP: params.agent.topP,
          maxTokens: params.agent.maxTokens,
          forceFailoverIndex: params.forceFailoverIndex,
        },
        params.history,
        params.userMessage,
        signal,
        {
          onStreamReset: () => {
            fullContent = '';
            callbacks.onStreamReset?.(streamId);
          },
        },
      );

      let result = await gen.next();
      while (!result.done) {
        if (result.value.delta) {
          fullContent += result.value.delta;
          callbacks.onChunk(result.value.delta, streamId);
        }
        result = await gen.next();
      }

      const completion = result.value;
      const usage = completion.usage;

      await this.sessions.addMessage({
        session: { connect: { id: sessionId } },
        role: 'ASSISTANT',
        content: completion.content,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        latencyMs: completion.latencyMs,
      });

      await this.sessions.update(sessionId, {
        promptVersionId: params.promptVersionId ?? undefined,
        totalPromptTokens: { increment: usage.promptTokens },
        totalCompletionTokens: { increment: usage.completionTokens },
        totalTokens: { increment: usage.totalTokens },
        lastLatencyMs: completion.latencyMs,
        lastProvider: completion.provider as import('@botme/database').AiProviderType,
        lastModel: completion.modelId,
      });

      callbacks.onDone({
        streamId,
        content: completion.content,
        usage: {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          latencyMs: completion.latencyMs,
          provider: completion.provider,
          model: completion.modelId,
          failoverFrom: completion.failoverFrom,
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
          message: err instanceof Error ? err.message : 'Ошибка генерации',
          retryable: false,
        });
      }
    } finally {
      this.streams.remove(streamId);
    }
  }
}
