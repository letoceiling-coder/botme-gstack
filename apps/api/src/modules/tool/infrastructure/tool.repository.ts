import { Injectable } from '@nestjs/common';
import type { Prisma, Tool, ToolExecution } from '@botme/database';
import { BUILTIN_TOOL_CATALOG } from '@botme/shared';
import { WorkspaceScopedRepository } from '../../../core/repository/workspace-scoped.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class ToolRepository extends WorkspaceScopedRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  list(workspaceId: string): Promise<Tool[]> {
    return this.prisma.client.tool.findMany({
      where: this.activeScope(workspaceId),
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  findById(workspaceId: string, toolId: string): Promise<Tool | null> {
    return this.prisma.client.tool.findFirst({
      where: { ...this.activeScope(workspaceId), id: toolId },
    });
  }

  findByType(workspaceId: string, type: string): Promise<Tool | null> {
    return this.prisma.client.tool.findFirst({
      where: { ...this.activeScope(workspaceId), type: type as Tool['type'] },
    });
  }

  async ensureBuiltinTools(workspaceId: string): Promise<void> {
    for (const entry of BUILTIN_TOOL_CATALOG) {
      const existing = await this.findByType(workspaceId, entry.type);
      if (existing) continue;
      await this.prisma.client.tool.create({
        data: {
          workspaceId,
          name: entry.name,
          slug: entry.slug,
          description: entry.description,
          category: entry.category,
          type: entry.type,
          schema: entry.schema as Prisma.InputJsonValue,
          permissions: entry.permissions as Prisma.InputJsonValue,
          timeoutMs: entry.timeoutMs,
          retryPolicy: entry.retryPolicy as Prisma.InputJsonValue,
        },
      });
    }
  }

  update(
    workspaceId: string,
    toolId: string,
    data: Prisma.ToolUpdateInput,
  ): Promise<Tool> {
    return this.prisma.client.tool.update({
      where: { id: toolId, workspaceId, deletedAt: null },
      data,
    });
  }

  countExecutions(workspaceId: string, toolId: string) {
    return this.prisma.client.toolExecution.count({ where: { workspaceId, toolId } });
  }

  avgLatency(workspaceId: string, toolId: string): Promise<number | null> {
    return this.prisma.client.toolExecution
      .aggregate({
        where: { workspaceId, toolId, latencyMs: { not: null } },
        _avg: { latencyMs: true },
      })
      .then((r) => (r._avg.latencyMs !== null ? Math.round(r._avg.latencyMs) : null));
  }

  lastExecution(workspaceId: string, toolId: string): Promise<ToolExecution | null> {
    return this.prisma.client.toolExecution.findFirst({
      where: { workspaceId, toolId },
      orderBy: { createdAt: 'desc' },
    });
  }

  boundAssistantIds(workspaceId: string, toolId: string): Promise<string[]> {
    return this.prisma.client.assistantTool
      .findMany({
        where: { toolId, assistant: { workspaceId, deletedAt: null } },
        select: { assistantId: true },
      })
      .then((rows) => rows.map((r) => r.assistantId));
  }
}
