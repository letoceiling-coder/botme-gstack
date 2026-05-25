import { Injectable } from '@nestjs/common';
import type { LeadSource, Tool } from '@botme/database';
import type { Prisma } from '@botme/database';
import {
  streamWithSingleToolStep,
  toolExecutor,
  type BoundToolInfo,
  type ToolContext,
} from '@botme/ai-core';
import type { AgentOrchestratorConfig, OrchestratorMessage } from '@botme/ai-core';
import type { AssistantRuntimeSnapshotDto, TestToolResultDto } from '@botme/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AgentModelRuntimeRouter } from '../../agent/application/agent-model-runtime-router.service';
import { RagRetrievalService } from '../../knowledge/application/rag-retrieval.service';
import { ToolExecutionRepository } from '../infrastructure/tool-execution.repository';
import { ToolRepository } from '../infrastructure/tool.repository';

type PinnedTools = AssistantRuntimeSnapshotDto['tools'];

@Injectable()
export class ToolRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: ToolRepository,
    private readonly executions: ToolExecutionRepository,
    private readonly rag: RagRetrievalService,
    private readonly modelRouter: AgentModelRuntimeRouter,
  ) {}

  buildBoundTools(pinnedTools: PinnedTools, workspaceTools: Tool[]): BoundToolInfo[] {
    const toolMap = new Map(workspaceTools.map((t) => [t.id, t]));
    return pinnedTools
      .map((pt) => {
        const db = toolMap.get(pt.id);
        if (!db || !db.enabled || db.status !== 'ACTIVE') return null;
        return {
          id: pt.id,
          name: pt.name,
          description: pt.description,
          type: pt.type,
          schema: (db.schema as Record<string, unknown>) ?? {},
        };
      })
      .filter(Boolean) as BoundToolInfo[];
  }

  async buildToolContext(params: {
    workspaceId: string;
    assistantId?: string;
    conversationId?: string;
    visitorId?: string;
    knowledgeBaseIds?: string[];
    leadSource?: LeadSource;
  }): Promise<ToolContext> {
    const { workspaceId, assistantId, conversationId, visitorId, knowledgeBaseIds, leadSource } =
      params;

    return {
      workspaceId,
      assistantId,
      conversationId,
      visitorId,
      knowledgeBaseIds,
      ragRetrieve:
        knowledgeBaseIds && knowledgeBaseIds.length > 0
          ? async (query: string) => {
              const rag = await this.rag.retrieve({
                workspaceId,
                knowledgeBaseIds,
                query,
                baseSystemPrompt: '',
              });
              return { output: rag.systemPrompt.replace(/^\s*/, ''), citations: rag.citations };
            }
          : undefined,
      persistLead: async (data) => {
        const lead = await this.prisma.client.lead.create({
          data: {
            workspace: { connect: { id: workspaceId } },
            assistant: assistantId ? { connect: { id: assistantId } } : undefined,
            conversation: conversationId ? { connect: { id: conversationId } } : undefined,
            source: leadSource ?? 'WIDGET',
            name: data.name,
            email: data.email,
            phone: data.phone,
            notes: data.notes,
          },
        });
        return { id: lead.id };
      },
      memoryStore: visitorId
        ? {
            get: async (key: string) => {
              const row = await this.prisma.client.visitorMemory.findUnique({
                where: { workspaceId_visitorId_key: { workspaceId, visitorId, key } },
              });
              return row?.value ?? null;
            },
            set: async (key: string, value: string) => {
              await this.prisma.client.visitorMemory.upsert({
                where: { workspaceId_visitorId_key: { workspaceId, visitorId, key } },
                create: { workspaceId, visitorId, key, value },
                update: { value },
              });
            },
            delete: async (key: string) => {
              await this.prisma.client.visitorMemory.deleteMany({
                where: { workspaceId, visitorId, key },
              });
            },
          }
        : undefined,
      persistCrmNote: async (content: string) => {
        const note = await this.prisma.client.crmNote.create({
          data: {
            workspace: { connect: { id: workspaceId } },
            assistant: assistantId ? { connect: { id: assistantId } } : undefined,
            content,
          },
        });
        return { id: note.id };
      },
    };
  }

  async executeTool(params: {
    workspaceId: string;
    tool: Tool;
    input: Record<string, unknown>;
    assistantId?: string;
    conversationId?: string;
    visitorId?: string;
    source?: 'TEST' | 'CHAT';
  }): Promise<TestToolResultDto> {
    const started = Date.now();
    const ctx = await this.buildToolContext({
      workspaceId: params.workspaceId,
      assistantId: params.assistantId,
      conversationId: params.conversationId,
      visitorId: params.visitorId,
      leadSource: params.source === 'TEST' ? 'API' : 'WIDGET',
    });

    const retryPolicy = params.tool.retryPolicy as { maxRetries: number; backoffMs: number };
    let result = await toolExecutor.execute(params.tool.type, params.input, ctx);
    let retryCount = 0;

    while (!result.ok && retryCount < (retryPolicy.maxRetries ?? 0)) {
      retryCount++;
      if (retryPolicy.backoffMs) {
        await new Promise((r) => setTimeout(r, retryPolicy.backoffMs));
      }
      result = await toolExecutor.execute(params.tool.type, params.input, ctx);
    }

    const latencyMs = Date.now() - started;
    const status = result.ok ? 'SUCCESS' : latencyMs >= params.tool.timeoutMs ? 'TIMEOUT' : 'FAILED';

    const execution = await this.executions.create({
      workspace: { connect: { id: params.workspaceId } },
      tool: { connect: { id: params.tool.id } },
      assistant: params.assistantId ? { connect: { id: params.assistantId } } : undefined,
      conversation: params.conversationId ? { connect: { id: params.conversationId } } : undefined,
      status,
      input: params.input as Prisma.InputJsonValue,
      output: result.ok
        ? ({ output: result.output, data: result.data ?? {} } as Prisma.InputJsonValue)
        : undefined,
      error: result.error,
      latencyMs,
      retryCount,
    });

    return {
      ok: result.ok,
      output: result.output,
      data: result.data,
      error: result.error,
      latencyMs,
      executionId: execution.id,
    };
  }

  async *streamWithTools(params: {
    config?: AgentOrchestratorConfig;
    agentId?: string;
    systemPrompt: string;
    temperature: number;
    topP: number;
    maxTokens: number;
    history: OrchestratorMessage[];
    userMessage: string;
    pinnedTools: PinnedTools;
    workspaceId: string;
    assistantId: string;
    conversationId: string;
    visitorId?: string;
    knowledgeBaseIds: string[];
    signal?: AbortSignal;
    forceFailoverIndex?: number;
    onStreamReset?: () => void;
  }) {
    await this.tools.ensureBuiltinTools(params.workspaceId);
    const workspaceTools = await this.tools.list(params.workspaceId);
    const boundTools = this.buildBoundTools(params.pinnedTools, workspaceTools);
    const toolContext = await this.buildToolContext({
      workspaceId: params.workspaceId,
      assistantId: params.assistantId,
      conversationId: params.conversationId,
      visitorId: params.visitorId,
      knowledgeBaseIds: params.knowledgeBaseIds,
      leadSource: params.visitorId?.startsWith('admin:') ? 'TEST_CHAT' : 'WIDGET',
    });

    const requireTools = boundTools.length > 0;
    let gen: AsyncGenerator<{ delta: string }, { content: string; toolUsed: boolean; toolType?: string; toolResult?: import('@botme/ai-core').ToolResult }, undefined>;

    if (params.agentId) {
      gen = this.modelRouter.streamWithToolsFailover(
        {
          workspaceId: params.workspaceId,
          agentId: params.agentId,
          systemPrompt: params.systemPrompt,
          temperature: params.temperature,
          topP: params.topP,
          maxTokens: params.maxTokens,
          requireTools,
          forceFailoverIndex: params.forceFailoverIndex,
        },
        params.history,
        params.userMessage,
        boundTools,
        toolContext,
        params.signal,
        { onStreamReset: params.onStreamReset },
      );
    } else if (params.config) {
      gen = streamWithSingleToolStep({
        config: params.config,
        history: params.history,
        userMessage: params.userMessage,
        tools: boundTools,
        toolContext,
        signal: params.signal,
      });
    } else {
      throw new Error('agentId or config required');
    }

    let result = await gen.next();
    while (!result.done) {
      yield result.value;
      result = await gen.next();
    }

    const final = result.value;
    if (final.toolUsed && final.toolType && final.toolResult) {
      const dbTool = workspaceTools.find((t) => t.type === final.toolType);
      if (dbTool) {
        await this.executions.create({
          workspace: { connect: { id: params.workspaceId } },
          tool: { connect: { id: dbTool.id } },
          assistant: { connect: { id: params.assistantId } },
          conversation: { connect: { id: params.conversationId } },
          status: final.toolResult.ok ? 'SUCCESS' : 'FAILED',
          input: {},
          output: final.toolResult.ok
            ? ({ output: final.toolResult.output, data: final.toolResult.data ?? {} } as Prisma.InputJsonValue)
            : undefined,
          error: final.toolResult.error,
          latencyMs: null,
          retryCount: 0,
        });
      }
    }

    return final;
  }
}
