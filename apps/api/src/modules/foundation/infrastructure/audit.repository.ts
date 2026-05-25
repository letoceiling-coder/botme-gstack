import { Injectable } from '@nestjs/common';
import type { AuditLog, Prisma } from '@botme/database';
import { WorkspaceScopedRepository } from '../../../core/repository/workspace-scoped.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

export interface AuditEntryInput {
  workspaceId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

@Injectable()
export class AuditRepository extends WorkspaceScopedRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  append(input: AuditEntryInput): Promise<AuditLog> {
    const data: Prisma.AuditLogCreateInput = {
      workspace: { connect: { id: input.workspaceId } },
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      ip: input.ip,
      ...(input.userId ? { user: { connect: { id: input.userId } } } : {}),
    };
    return this.prisma.client.auditLog.create({ data });
  }

  listByWorkspace(workspaceId: string, limit = 50): Promise<AuditLog[]> {
    return this.prisma.client.auditLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
