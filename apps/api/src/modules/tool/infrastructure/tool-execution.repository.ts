import { Injectable } from '@nestjs/common';
import type { Prisma, ToolExecution } from '@botme/database';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class ToolExecutionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ToolExecutionCreateInput): Promise<ToolExecution> {
    return this.prisma.client.toolExecution.create({ data });
  }

  listByTool(workspaceId: string, toolId: string, limit = 20): Promise<ToolExecution[]> {
    return this.prisma.client.toolExecution.findMany({
      where: { workspaceId, toolId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  listRecent(workspaceId: string, limit = 50): Promise<ToolExecution[]> {
    return this.prisma.client.toolExecution.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { tool: true },
    });
  }
}
