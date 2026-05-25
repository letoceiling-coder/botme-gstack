import { ForbiddenException, Injectable } from '@nestjs/common';
import type { WorkspaceRole } from '@botme/shared';
import type { Prisma } from '@botme/database';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { WorkspaceRepository } from '../infrastructure/workspace.repository';

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly repo: WorkspaceRepository,
    private readonly prisma: PrismaService,
  ) {}

  async listForUser(userId: string) {
    const memberships = await this.repo.listByUser(userId);
    return memberships.map((m) => ({
      id: m.workspace.id,
      slug: m.workspace.slug,
      name: m.workspace.name,
      role: m.role,
      memberCount: m.workspace._count.members,
      createdAt: m.workspace.createdAt,
    }));
  }

  async getSummary(workspaceId: string, userId: string) {
    const membership = await this.repo.findMembership(userId, workspaceId);
    if (!membership) {
      throw new ForbiddenException('Workspace недоступен');
    }
    const stats = await this.repo.getStats(workspaceId);
    return {
      workspace: {
        id: membership.workspace.id,
        slug: membership.workspace.slug,
        name: membership.workspace.name,
      },
      role: membership.role as WorkspaceRole,
      stats,
    };
  }

  async create(userId: string, name: string) {
    const slug = this.slugify(name);
    const workspace = await this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.workspace.create({ data: { name, slug } });
      await tx.workspaceMember.create({
        data: { workspaceId: created.id, userId, role: 'OWNER' },
      });
      return created;
    });
    return {
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
    };
  }

  private slugify(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9\u0400-\u04FF]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    const suffix = Math.random().toString(36).slice(2, 8);
    return `${base || 'workspace'}-${suffix}`;
  }
}
