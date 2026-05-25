import { Injectable } from '@nestjs/common';
import type { RefreshToken, User, Workspace, WorkspaceMember, WorkspaceRole } from '@botme/database';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.client.user.findUnique({ where: { email } });
  }

  findUserById(id: string): Promise<User | null> {
    return this.prisma.client.user.findUnique({ where: { id } });
  }

  findFirstMembership(userId: string): Promise<WorkspaceMember | null> {
    return this.prisma.client.workspaceMember.findFirst({
      where: { userId, workspace: { deletedAt: null } },
      orderBy: { createdAt: 'asc' },
    });
  }

  findMembership(userId: string, workspaceId: string): Promise<WorkspaceMember | null> {
    return this.prisma.client.workspaceMember.findFirst({
      where: { userId, workspaceId, workspace: { deletedAt: null } },
    });
  }

  listMemberships(
    userId: string,
  ): Promise<Array<WorkspaceMember & { workspace: Workspace; role: WorkspaceRole }>> {
    return this.prisma.client.workspaceMember.findMany({
      where: { userId, workspace: { deletedAt: null } },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    }) as Promise<Array<WorkspaceMember & { workspace: Workspace; role: WorkspaceRole }>>;
  }

  findRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.client.refreshToken.findUnique({ where: { tokenHash } });
  }

  saveRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<RefreshToken> {
    return this.prisma.client.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  revokeRefreshToken(tokenHash: string): Promise<void> {
    return this.prisma.client.refreshToken
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .then(() => undefined);
  }
}
