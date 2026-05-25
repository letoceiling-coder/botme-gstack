import { Injectable } from '@nestjs/common';
import type { Assistant, WidgetDomain, WidgetInstance } from '@botme/database';
import { WorkspaceScopedRepository } from '../../../core/repository/workspace-scoped.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

export type WidgetWithDomains = WidgetInstance & {
  domains: WidgetDomain[];
  assistant: Assistant;
};

@Injectable()
export class WidgetRepository extends WorkspaceScopedRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  findActiveByPublicKey(publicKey: string): Promise<WidgetWithDomains | null> {
    return this.prisma.client.widgetInstance.findFirst({
      where: {
        publicKey,
        deletedAt: null,
        isActive: true,
        assistant: {
          deletedAt: null,
          isActive: true,
          status: 'ACTIVE',
        },
      },
      include: {
        domains: true,
        assistant: true,
      },
    });
  }

  findByIdScoped(workspaceId: string, widgetId: string): Promise<WidgetWithDomains | null> {
    return this.prisma.client.widgetInstance.findFirst({
      where: {
        ...this.activeScope(workspaceId),
        id: widgetId,
      },
      include: {
        domains: true,
        assistant: true,
      },
    });
  }
}
