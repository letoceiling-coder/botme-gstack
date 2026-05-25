import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { WorkspaceScopedRepository } from './workspace-scoped.repository';
import type { PrismaService } from '../prisma/prisma.service';

class TestRepo extends WorkspaceScopedRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  exposeScope(workspaceId: string) {
    return this.activeScope(workspaceId);
  }

  exposeAssert(entityWorkspaceId: string, requestWorkspaceId: string) {
    this.assertSameWorkspace(entityWorkspaceId, requestWorkspaceId);
  }
}

describe('WorkspaceScopedRepository', () => {
  const repo = new TestRepo({} as PrismaService);

  it('builds active tenant scope', () => {
    expect(repo.exposeScope('ws_1')).toEqual({ workspaceId: 'ws_1', deletedAt: null });
  });

  it('allows same workspace', () => {
    expect(() => repo.exposeAssert('ws_1', 'ws_1')).not.toThrow();
  });

  it('rejects cross-tenant access', () => {
    expect(() => repo.exposeAssert('ws_2', 'ws_1')).toThrow(ForbiddenException);
  });
});
