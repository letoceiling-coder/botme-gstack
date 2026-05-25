import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma, WidgetInstance } from '@botme/database';
import type { LauncherConfig, WidgetDetailDto, WidgetDto } from '@botme/shared';
import { DEFAULT_LAUNCHER_CONFIG } from '@botme/shared';
import { WorkspaceScopedRepository } from '../../../core/repository/workspace-scoped.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

export type WidgetWithRelations = WidgetInstance & {
  domains: { domain: string }[];
  assistant: { id: string; name: string };
  _count?: { conversations: number };
};

@Injectable()
export class WidgetAdminRepository extends WorkspaceScopedRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  list(workspaceId: string): Promise<WidgetWithRelations[]> {
    return this.prisma.client.widgetInstance.findMany({
      where: this.activeScope(workspaceId),
      include: {
        domains: true,
        assistant: { select: { id: true, name: true } },
        _count: { select: { conversations: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(workspaceId: string, id: string): Promise<WidgetWithRelations | null> {
    return this.prisma.client.widgetInstance.findFirst({
      where: { ...this.activeScope(workspaceId), id },
      include: {
        domains: true,
        assistant: { select: { id: true, name: true } },
        _count: { select: { conversations: true } },
      },
    });
  }

  create(data: Prisma.WidgetInstanceCreateInput): Promise<WidgetWithRelations> {
    return this.prisma.client.widgetInstance.create({
      data,
      include: {
        domains: true,
        assistant: { select: { id: true, name: true } },
        _count: { select: { conversations: true } },
      },
    });
  }

  update(
    workspaceId: string,
    id: string,
    data: Prisma.WidgetInstanceUpdateInput,
  ): Promise<WidgetWithRelations> {
    return this.prisma.client.widgetInstance.update({
      where: { id, workspaceId, deletedAt: null },
      data,
      include: {
        domains: true,
        assistant: { select: { id: true, name: true } },
        _count: { select: { conversations: true } },
      },
    });
  }

  softDelete(workspaceId: string, id: string): Promise<void> {
    return this.prisma.client.widgetInstance
      .update({
        where: { id, workspaceId },
        data: { deletedAt: new Date(), isActive: false },
      })
      .then(() => undefined);
  }

  replaceDomains(widgetId: string, domains: string[]): Promise<void> {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.widgetDomain.deleteMany({ where: { widgetId } });
      if (domains.length) {
        await tx.widgetDomain.createMany({
          data: domains.map((domain) => ({ widgetId, domain: domain.toLowerCase() })),
        });
      }
    });
  }

  generatePublicKey(): string {
    return `wm_${randomBytes(16).toString('hex')}`;
  }

  getWorkspace(workspaceId: string): Promise<{ id: string; name: string; slug: string } | null> {
    return this.prisma.client.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { id: true, name: true, slug: true },
    });
  }
}

export function toWidgetDto(row: WidgetWithRelations, embedOrigin = 'https://agent.neeklo.ru'): WidgetDto {
  return {
    id: row.id,
    name: row.name,
    publicKey: row.publicKey,
    assistantId: row.assistantId,
    assistantName: row.assistant.name,
    isActive: row.isActive,
    domains: row.domains.map((d) => d.domain),
    launcherConfig: (row.launcherConfig as LauncherConfig | null) ?? null,
    conversationCount: row._count?.conversations ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toWidgetDetailDto(row: WidgetWithRelations, embedOrigin = 'https://agent.neeklo.ru'): WidgetDetailDto {
  const dto = toWidgetDto(row, embedOrigin);
  const embedCode = `<script src="${embedOrigin}/widget.js" data-widget-key="${row.publicKey}"></script>`;
  return {
    ...dto,
    embedCode,
    installGuide: [
      'Скопируйте embed-код и вставьте перед </body> на вашем сайте.',
      `Разрешённые домены: ${dto.domains.join(', ') || 'не заданы'}.`,
      'Виджет подключается к assistant runtime через WebSocket.',
      'Для локальной разработки используйте data-widget-origin.',
    ],
  };
}
