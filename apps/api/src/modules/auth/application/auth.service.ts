import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hashToken } from '@botme/crypto';
import type {
  AuthSession,
  AuthTokens,
  AuthUser,
  AuthWorkspace,
  JwtPayload,
  LoginInput,
  RegisterInput,
  WorkspaceRole,
} from '@botme/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { Prisma } from '@botme/database';
import { AuthRepository } from '../infrastructure/auth.repository';
import { PasswordService } from '../infrastructure/password.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async register(input: RegisterInput): Promise<AuthSession & AuthTokens> {
    const existing = await this.repo.findUserByEmail(input.email);
    if (existing) {
      throw new UnauthorizedException('Email уже зарегистрирован');
    }
    const passwordHash = await this.passwords.hash(input.password);
    const slug = this.slugify(input.workspaceName);

    const result = await this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          email: input.email.toLowerCase(),
          passwordHash,
          name: input.name,
        },
      });
      const workspace = await tx.workspace.create({
        data: { name: input.workspaceName, slug },
      });
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: 'OWNER',
        },
      });
      return { user, workspace };
    });

    return this.buildSession(result.user.id, result.workspace.id);
  }

  async login(input: LoginInput): Promise<AuthSession & AuthTokens> {
    const user = await this.repo.findUserByEmail(input.email.toLowerCase());
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Неверный email или пароль');
    }
    const valid = await this.passwords.verify(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }
    const membership = await this.repo.findFirstMembership(user.id);
    if (!membership) {
      throw new UnauthorizedException('Нет доступных workspace');
    }
    return this.buildSession(user.id, membership.workspaceId);
  }

  async refresh(refreshToken: string): Promise<AuthSession & AuthTokens> {
    let payload: { sub: string; workspaceId: string };
    try {
      payload = this.jwt.verify<{ sub: string; workspaceId: string }>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token недействителен');
    }

    const tokenHash = hashToken(refreshToken);
    const stored = await this.repo.findRefreshToken(tokenHash);
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token недействителен');
    }

    await this.repo.revokeRefreshToken(tokenHash);
    return this.buildSession(payload.sub, payload.workspaceId);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.repo.revokeRefreshToken(hashToken(refreshToken));
  }

  async me(userId: string, workspaceId: string): Promise<AuthSession> {
    return this.loadSession(userId, workspaceId);
  }

  async switchWorkspace(userId: string, workspaceId: string): Promise<AuthSession & AuthTokens> {
    const membership = await this.repo.findMembership(userId, workspaceId);
    if (!membership) {
      throw new UnauthorizedException('Workspace недоступен');
    }
    return this.buildSession(userId, workspaceId);
  }

  private async buildSession(
    userId: string,
    workspaceId: string,
  ): Promise<AuthSession & AuthTokens> {
    const session = await this.loadSession(userId, workspaceId);
    const tokens = await this.issueTokens(userId, session.user.email, workspaceId, session.workspace.role);
    return { ...session, ...tokens };
  }

  private async loadSession(userId: string, workspaceId: string): Promise<AuthSession> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Пользователь не найден');
    }
    const memberships = await this.repo.listMemberships(userId);
    const active = memberships.find((m) => m.workspaceId === workspaceId);
    if (!active) {
      throw new UnauthorizedException('Workspace недоступен');
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
    };

    const workspaces: AuthWorkspace[] = memberships.map((m) => ({
      id: m.workspace.id,
      slug: m.workspace.slug,
      name: m.workspace.name,
      role: m.role as WorkspaceRole,
    }));

    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (!workspace) {
      throw new UnauthorizedException('Workspace недоступен');
    }

    return {
      user: authUser,
      workspace,
      workspaces,
    };
  }

  private async issueTokens(
    userId: string,
    email: string,
    workspaceId: string,
    role: WorkspaceRole,
  ): Promise<AuthTokens> {
    const accessTtl = Number(this.config.get('JWT_ACCESS_TTL') ?? 900) || 900;
    const refreshTtl = Number(this.config.get('JWT_REFRESH_TTL') ?? 604800) || 604800;

    const accessPayload: JwtPayload = {
      sub: userId,
      email,
      workspaceId,
      role,
      type: 'access',
    };

    const accessToken = this.jwt.sign(accessPayload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });

    const refreshToken = this.jwt.sign(
      { sub: userId, workspaceId, type: 'refresh', jti: randomUUID() },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshTtl,
      },
    );

    const expiresAt = new Date(Date.now() + refreshTtl * 1000);
    await this.repo.saveRefreshToken(userId, hashToken(refreshToken), expiresAt);

    return { accessToken, refreshToken, expiresIn: accessTtl };
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
