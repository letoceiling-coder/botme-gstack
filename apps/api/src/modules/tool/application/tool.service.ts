import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@botme/database';
import type { TestToolResultDto, ToolDetailDto, ToolDto, ToolExecutionDto } from '@botme/shared';
import { TestToolSchema, UpdateToolSchema } from '@botme/shared';
import { ToolRepository } from '../infrastructure/tool.repository';
import { ToolExecutionRepository } from '../infrastructure/tool-execution.repository';
import { ToolRuntimeService } from './tool-runtime.service';

@Injectable()
export class ToolService {
  constructor(
    private readonly tools: ToolRepository,
    private readonly executions: ToolExecutionRepository,
    private readonly runtime: ToolRuntimeService,
  ) {}

  async list(workspaceId: string): Promise<ToolDto[]> {
    await this.tools.ensureBuiltinTools(workspaceId);
    const rows = await this.tools.list(workspaceId);
    return Promise.all(rows.map((t) => this.toDto(workspaceId, t)));
  }

  async getDetail(workspaceId: string, toolId: string): Promise<ToolDetailDto> {
    await this.tools.ensureBuiltinTools(workspaceId);
    const tool = await this.tools.findById(workspaceId, toolId);
    if (!tool) throw new NotFoundException('Инструмент не найден');

    const [recentExecutions, boundAssistantIds] = await Promise.all([
      this.executions.listByTool(workspaceId, toolId, 20),
      this.tools.boundAssistantIds(workspaceId, toolId),
    ]);

    const dto = await this.toDto(workspaceId, tool);
    return {
      ...dto,
      recentExecutions: recentExecutions.map((e) => this.toExecutionDto(e, tool.name)),
      boundAssistantIds,
    };
  }

  async update(workspaceId: string, toolId: string, body: unknown) {
    const input = UpdateToolSchema.parse(body);
    const tool = await this.tools.findById(workspaceId, toolId);
    if (!tool) throw new NotFoundException('Инструмент не найден');

    const data: Prisma.ToolUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.timeoutMs !== undefined) data.timeoutMs = input.timeoutMs;
    if (input.retryPolicy !== undefined) data.retryPolicy = input.retryPolicy as Prisma.InputJsonValue;
    if (input.permissions !== undefined) data.permissions = input.permissions as Prisma.InputJsonValue;

    const updated = await this.tools.update(workspaceId, toolId, data);
    return this.toDto(workspaceId, updated);
  }

  async testExecute(workspaceId: string, toolId: string, body: unknown): Promise<TestToolResultDto> {
    const input = TestToolSchema.parse(body);
    const tool = await this.tools.findById(workspaceId, toolId);
    if (!tool) throw new NotFoundException('Инструмент не найден');
    if (!tool.enabled) throw new NotFoundException('Инструмент отключён');

    return this.runtime.executeTool({
      workspaceId,
      tool,
      input: input.input,
      assistantId: input.assistantId,
      conversationId: input.conversationId,
      source: 'TEST',
    });
  }

  private async toDto(workspaceId: string, tool: Awaited<ReturnType<ToolRepository['list']>>[number]): Promise<ToolDto> {
    const [executionCount, avgLatencyMs, last] = await Promise.all([
      this.tools.countExecutions(workspaceId, tool.id),
      this.tools.avgLatency(workspaceId, tool.id),
      this.tools.lastExecution(workspaceId, tool.id),
    ]);

    return {
      id: tool.id,
      name: tool.name,
      slug: tool.slug,
      description: tool.description,
      category: tool.category,
      type: tool.type,
      status: tool.status,
      enabled: tool.enabled,
      schema: tool.schema as Record<string, unknown>,
      permissions: tool.permissions as string[],
      timeoutMs: tool.timeoutMs,
      retryPolicy: tool.retryPolicy as { maxRetries: number; backoffMs: number },
      executionCount,
      avgLatencyMs,
      lastStatus: last?.status ?? null,
      createdAt: tool.createdAt.toISOString(),
      updatedAt: tool.updatedAt.toISOString(),
    };
  }

  private toExecutionDto(
    e: Awaited<ReturnType<ToolExecutionRepository['listByTool']>>[number],
    toolName: string,
  ): ToolExecutionDto {
    return {
      id: e.id,
      toolId: e.toolId,
      toolName,
      assistantId: e.assistantId,
      conversationId: e.conversationId,
      status: e.status,
      input: e.input as Record<string, unknown>,
      output: (e.output as Record<string, unknown> | null) ?? null,
      error: e.error,
      latencyMs: e.latencyMs,
      retryCount: e.retryCount,
      createdAt: e.createdAt.toISOString(),
    };
  }
}
