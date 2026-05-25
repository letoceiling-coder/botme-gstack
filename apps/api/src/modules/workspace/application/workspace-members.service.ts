import { createHash, randomBytes } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorkspaceRole } from '@botme/shared';
import {
  InviteMemberSchema,
  UpdateMemberRoleSchema,
  type InviteMemberResultDto,
  type WorkspaceInviteDto,
  type WorkspaceMemberDto,
} from '@botme/shared';
import { WS_NAMESPACES } from '@botme/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RealtimeRuntimeService } from '../../realtime/services/realtime-runtime.service';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class WorkspaceMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly runtime: RealtimeRuntimeService,
  ) {}

  async listMembers(workspaceId: string): Promise<WorkspaceMemberDto[]> {
    const members = await this.prisma.client.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const onlineUserIds = new Set(
      this.runtime
        .getRuntime()
        .sockets.listByWorkspace(workspaceId)
        .filter((s) => s.namespace === WS_NAMESPACES.operator)
        .map((s) => s.sessionId),
    );
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role as WorkspaceRole,
      createdAt: m.createdAt.toISOString(),
      isOnline: onlineUserIds.has(m.userId),
      activeSessions: onlineUserIds.has(m.userId) ? 1 : 0,
    }));
  }

  async listInvites(workspaceId: string): Promise<WorkspaceInviteDto[]> {
    const rows = await this.prisma.client.workspaceInvite.findMany({
      where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role as WorkspaceRole,
      inviteUrl: '',
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async inviteMember(
    workspaceId: string,
    invitedById: string,
    body: unknown,
  ): Promise<InviteMemberResultDto> {
    const input = InviteMemberSchema.parse(body);
    const email = input.email.toLowerCase();

    const existingUser = await this.prisma.client.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMember = await this.prisma.client.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
      });
      if (existingMember) {
        throw new BadRequestException('Пользователь уже в workspace');
      }
      const member = await this.prisma.client.workspaceMember.create({
        data: {
          workspaceId,
          userId: existingUser.id,
          role: input.role,
        },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      return {
        kind: 'member_added',
        member: {
          id: member.id,
          userId: member.userId,
          email: member.user.email,
          name: member.user.name,
          role: member.role as WorkspaceRole,
          createdAt: member.createdAt.toISOString(),
          isOnline: false,
          activeSessions: 0,
        },
      };
    }

    const rawToken = randomBytes(24).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000);
    const invite = await this.prisma.client.workspaceInvite.upsert({
      where: { workspaceId_email: { workspaceId, email } },
      create: {
        workspaceId,
        email,
        role: input.role,
        tokenHash,
        invitedById,
        expiresAt,
      },
      update: {
        role: input.role,
        tokenHash,
        invitedById,
        expiresAt,
        acceptedAt: null,
      },
    });

    const webUrl = this.config.get<string>('WEB_URL', 'https://agent.neeklo.ru').replace(/\/$/, '');
    return {
      kind: 'invite_created',
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role as WorkspaceRole,
        inviteUrl: `${webUrl}/register?invite=${rawToken}`,
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
      },
    };
  }

  async updateMemberRole(
    workspaceId: string,
    actorId: string,
    memberId: string,
    body: unknown,
  ): Promise<WorkspaceMemberDto> {
    const input = UpdateMemberRoleSchema.parse(body);
    const member = await this.prisma.client.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!member) throw new NotFoundException('Участник не найден');
    if (member.role === 'OWNER') throw new ForbiddenException('Нельзя изменить роль владельца');
    if (member.userId === actorId && input.role !== member.role) {
      throw new ForbiddenException('Нельзя изменить собственную роль');
    }
    const updated = await this.prisma.client.workspaceMember.update({
      where: { id: memberId },
      data: { role: input.role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return {
      id: updated.id,
      userId: updated.userId,
      email: updated.user.email,
      name: updated.user.name,
      role: updated.role as WorkspaceRole,
      createdAt: updated.createdAt.toISOString(),
      isOnline: false,
      activeSessions: 0,
    };
  }

  async removeMember(workspaceId: string, actorId: string, memberId: string): Promise<{ ok: boolean }> {
    const member = await this.prisma.client.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
    });
    if (!member) throw new NotFoundException('Участник не найден');
    if (member.role === 'OWNER') throw new ForbiddenException('Нельзя удалить владельца');
    if (member.userId === actorId) throw new ForbiddenException('Нельзя удалить себя');
    await this.prisma.client.workspaceMember.delete({ where: { id: memberId } });
    return { ok: true };
  }

  async revokeInvite(workspaceId: string, inviteId: string): Promise<{ ok: boolean }> {
    const invite = await this.prisma.client.workspaceInvite.findFirst({
      where: { id: inviteId, workspaceId },
    });
    if (!invite) throw new NotFoundException('Приглашение не найдено');
    await this.prisma.client.workspaceInvite.delete({ where: { id: inviteId } });
    return { ok: true };
  }
}
