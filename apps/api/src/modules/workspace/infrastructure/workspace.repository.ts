import { Injectable } from '@nestjs/common';
import type { Workspace, WorkspaceMember } from '@botme/database';
import { PrismaService } from '../../../core/prisma/prisma.service';

type MembershipWithWorkspace = WorkspaceMember & { workspace: Workspace };

@Injectable()
export class WorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByUser(userId: string) {
    return this.prisma.client.workspaceMember.findMany({
      where: { userId, workspace: { deletedAt: null } },
      include: {
        workspace: {
          include: { _count: { select: { members: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  findMembership(userId: string, workspaceId: string): Promise<MembershipWithWorkspace | null> {
    return this.prisma.client.workspaceMember.findFirst({
      where: { userId, workspaceId, workspace: { deletedAt: null } },
      include: { workspace: true },
    });
  }

  async getStats(workspaceId: string) {
    const [memberCount, agentsCount, assistantsCount, conversationsCount, leadsCount] =
      await Promise.all([
      this.prisma.client.workspaceMember.count({ where: { workspaceId } }),
      this.prisma.client.agent.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.client.assistant.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.client.conversation.count({ where: { workspaceId } }),
      this.prisma.client.lead.count({ where: { workspaceId } }),
    ]);
    return {
      memberCount,
      agentsCount,
      assistantsCount,
      conversationsCount,
      leadsCount,
    };
  }
}
