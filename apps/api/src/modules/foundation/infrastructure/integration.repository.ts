import { Injectable } from '@nestjs/common';
import type { AiIntegration, Prisma } from '@botme/database';
import { WorkspaceScopedRepository } from '../../../core/repository/workspace-scoped.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class IntegrationRepository extends WorkspaceScopedRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  findById(workspaceId: string, id: string): Promise<AiIntegration | null> {
    return this.prisma.client.aiIntegration.findFirst({
      where: {
        ...this.activeScope(workspaceId),
        id,
      },
    });
  }

  /** KB policy: root OpenRouter integration (name "root" → default → any active OPENROUTER). */
  async findRootOpenRouter(workspaceId: string): Promise<AiIntegration | null> {
    const base = { workspaceId, deletedAt: null, provider: 'OPENROUTER' as const };
    const byName = await this.prisma.client.aiIntegration.findFirst({
      where: { ...base, name: { equals: 'root', mode: 'insensitive' }, status: 'ACTIVE' },
    });
    if (byName) return byName;

    const byDefault = await this.prisma.client.aiIntegration.findFirst({
      where: { ...base, isDefault: true, status: 'ACTIVE' },
    });
    if (byDefault) return byDefault;

    return this.prisma.client.aiIntegration.findFirst({
      where: { ...base, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
  }

  listByWorkspace(workspaceId: string): Promise<AiIntegration[]> {
    return this.prisma.client.aiIntegration.findMany({
      where: this.activeScope(workspaceId),
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: Prisma.AiIntegrationCreateInput): Promise<AiIntegration> {
    return this.prisma.client.aiIntegration.create({ data });
  }

  update(id: string, data: Prisma.AiIntegrationUpdateInput): Promise<AiIntegration> {
    return this.prisma.client.aiIntegration.update({ where: { id }, data });
  }

  async clearOtherDefaults(workspaceId: string, exceptId: string): Promise<void> {
    await this.prisma.client.aiIntegration.updateMany({
      where: { workspaceId, deletedAt: null, id: { not: exceptId }, isDefault: true },
      data: { isDefault: false },
    });
  }

  async softDelete(workspaceId: string, id: string): Promise<AiIntegration | null> {
    const existing = await this.findById(workspaceId, id);
    if (!existing) {
      return null;
    }
    return this.prisma.client.aiIntegration.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
