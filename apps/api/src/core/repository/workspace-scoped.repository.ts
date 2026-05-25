import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Base for tenant-scoped repositories — every query must include workspaceId. */
export abstract class WorkspaceScopedRepository {
  constructor(protected readonly prisma: PrismaService) {}

  /** Standard active-tenant filter. */
  protected activeScope(workspaceId: string): { workspaceId: string; deletedAt: null } {
    return { workspaceId, deletedAt: null };
  }

  /** Reject cross-tenant resource access. */
  protected assertSameWorkspace(
    entityWorkspaceId: string,
    requestWorkspaceId: string,
    message = 'Cross-workspace access denied',
  ): void {
    if (entityWorkspaceId !== requestWorkspaceId) {
      throw new ForbiddenException(message);
    }
  }
}
