import { Injectable } from '@nestjs/common';
import type { Agent, AgentPromptVersion, Prisma } from '@botme/database';
import { WorkspaceScopedRepository } from '../../../core/repository/workspace-scoped.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

export type AgentWithIntegration = Agent & {
  integration: { id: string; name: string; provider: string; status: string; workspaceId: string };
  activePromptVersion: AgentPromptVersion | null;
  promptVersions: Array<
    AgentPromptVersion & { createdByUser: { id: string; name: string | null } }
  >;
};

@Injectable()
export class AgentRepository extends WorkspaceScopedRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  findById(workspaceId: string, id: string): Promise<AgentWithIntegration | null> {
    return this.prisma.client.agent.findFirst({
      where: { ...this.activeScope(workspaceId), id },
      include: {
        integration: {
          select: { id: true, name: true, provider: true, status: true, workspaceId: true },
        },
        activePromptVersion: true,
        promptVersions: {
          orderBy: { version: 'desc' },
          include: { createdByUser: { select: { id: true, name: true } } },
        },
      },
    });
  }

  listByWorkspace(workspaceId: string): Promise<Agent[]> {
    return this.prisma.client.agent.findMany({
      where: this.activeScope(workspaceId),
      orderBy: { updatedAt: 'desc' },
    });
  }

  create(data: Prisma.AgentCreateInput): Promise<Agent> {
    return this.prisma.client.agent.create({ data });
  }

  update(id: string, data: Prisma.AgentUpdateInput): Promise<Agent> {
    return this.prisma.client.agent.update({ where: { id }, data });
  }

  async softDelete(workspaceId: string, id: string): Promise<Agent | null> {
    const existing = await this.prisma.client.agent.findFirst({
      where: { ...this.activeScope(workspaceId), id },
    });
    if (!existing) return null;
    return this.prisma.client.agent.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });
  }

  findPromptVersion(
    agentId: string,
    version: number,
  ): Promise<AgentPromptVersion | null> {
    return this.prisma.client.agentPromptVersion.findUnique({
      where: { agentId_version: { agentId, version } },
    });
  }

  getNextVersionNumber(agentId: string): Promise<number> {
    return this.prisma.client.agentPromptVersion
      .aggregate({ where: { agentId }, _max: { version: true } })
      .then((r) => (r._max.version ?? 0) + 1);
  }

  createPromptVersion(data: Prisma.AgentPromptVersionCreateInput): Promise<AgentPromptVersion> {
    return this.prisma.client.agentPromptVersion.create({ data });
  }

  setActivePromptVersion(agentId: string, versionId: string, systemPrompt: string): Promise<Agent> {
    return this.prisma.client.agent.update({
      where: { id: agentId },
      data: { activePromptVersionId: versionId, systemPrompt },
    });
  }
}
