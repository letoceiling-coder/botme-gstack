import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { hashToken } from '@botme/crypto';
import type {
  CreateOperatorRuntimeTokenInput,
  JwtPayload,
  OperatorRuntimeSessionDto,
  OperatorRuntimeTokenDto,
  UpdateOperatorRuntimeTokenInput,
} from '@botme/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';

function generatePlainToken(): string {
  return `ort_${randomBytes(32).toString('base64url')}`;
}

function hostnameFromOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function domainMatches(hostname: string, pattern: string): boolean {
  const p = pattern.toLowerCase().replace(/^https?:\/\//, '').split('/')[0] ?? pattern;
  if (p.startsWith('*.')) {
    const suffix = p.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }
  return hostname === p;
}

@Injectable()
export class OperatorRuntimeTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async list(workspaceId: string, widgetId: string): Promise<OperatorRuntimeTokenDto[]> {
    const rows = await this.prisma.client.operatorRuntimeToken.findMany({
      where: { workspaceId, widgetId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async create(
    workspaceId: string,
    widgetId: string,
    userId: string,
    input: CreateOperatorRuntimeTokenInput,
  ): Promise<OperatorRuntimeTokenDto> {
    await this.assertWidget(workspaceId, widgetId);
    const plainToken = generatePlainToken();
    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 86_400_000)
      : null;

    const row = await this.prisma.client.operatorRuntimeToken.create({
      data: {
        workspaceId,
        widgetId,
        name: input.name,
        tokenHash: hashToken(plainToken),
        tokenPrefix: plainToken.slice(0, 16),
        allowedDomains: input.allowedDomains,
        expiresAt,
        createdById: userId,
      },
    });

    return { ...this.toDto(row), plainToken };
  }

  async update(
    workspaceId: string,
    widgetId: string,
    tokenId: string,
    input: UpdateOperatorRuntimeTokenInput,
  ): Promise<OperatorRuntimeTokenDto> {
    await this.assertToken(workspaceId, widgetId, tokenId);
    const row = await this.prisma.client.operatorRuntimeToken.update({
      where: { id: tokenId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.allowedDomains !== undefined ? { allowedDomains: input.allowedDomains } : {}),
      },
    });
    return this.toDto(row);
  }

  async revoke(workspaceId: string, widgetId: string, tokenId: string): Promise<{ ok: boolean }> {
    await this.assertToken(workspaceId, widgetId, tokenId);
    await this.prisma.client.operatorRuntimeToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async getActiveForWidget(workspaceId: string, widgetId: string): Promise<OperatorRuntimeTokenDto | null> {
    const row = await this.prisma.client.operatorRuntimeToken.findFirst({
      where: {
        workspaceId,
        widgetId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toDto(row) : null;
  }

  async exchangeSession(
    plainToken: string,
    origin: string | undefined,
    workspaceIdHint?: string,
  ): Promise<OperatorRuntimeSessionDto> {
    const tokenHash = hashToken(plainToken);
    const row = await this.prisma.client.operatorRuntimeToken.findUnique({
      where: { tokenHash },
      include: {
        workspace: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { id: true, email: true, name: true } },
      },
    });

    if (!row || row.revokedAt) {
      throw new UnauthorizedException('Недействительный operator token');
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Operator token истёк');
    }
    if (workspaceIdHint && row.workspaceId !== workspaceIdHint) {
      throw new UnauthorizedException('Operator token не соответствует workspace');
    }

    const hostname = hostnameFromOrigin(origin);
    if (row.allowedDomains.length > 0 && hostname) {
      const allowed = row.allowedDomains.some((d) => domainMatches(hostname, d));
      if (!allowed) {
        throw new UnauthorizedException('Домен не разрешён для operator token');
      }
    }

    await this.prisma.client.operatorRuntimeToken.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });

    const accessTtl = Number(this.config.get('JWT_ACCESS_TTL') ?? 900) || 900;
    const payload: JwtPayload = {
      sub: row.createdById,
      email: row.createdBy.email,
      workspaceId: row.workspaceId,
      role: 'OPERATOR',
      type: 'access',
      runtimeTokenId: row.id,
    };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });

    return {
      accessToken,
      expiresIn: accessTtl,
      user: {
        id: row.createdBy.id,
        email: row.createdBy.email,
        name: row.createdBy.name,
      },
      workspace: {
        id: row.workspace.id,
        name: row.workspace.name,
        slug: row.workspace.slug,
        role: 'OPERATOR',
      },
    };
  }

  async isOriginAllowedForRuntimeToken(runtimeTokenId: string, origin: string): Promise<boolean> {
    const row = await this.prisma.client.operatorRuntimeToken.findUnique({
      where: { id: runtimeTokenId },
      select: { allowedDomains: true, revokedAt: true, expiresAt: true },
    });
    if (!row || row.revokedAt) return false;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return false;
    if (row.allowedDomains.length === 0) return true;
    const hostname = hostnameFromOrigin(origin);
    if (!hostname) return false;
    return row.allowedDomains.some((d) => domainMatches(hostname, d));
  }

  private async assertWidget(workspaceId: string, widgetId: string): Promise<void> {
    const widget = await this.prisma.client.widgetInstance.findFirst({
      where: { id: widgetId, workspaceId, deletedAt: null },
    });
    if (!widget) throw new NotFoundException('Виджет не найден');
  }

  private async assertToken(workspaceId: string, widgetId: string, tokenId: string): Promise<void> {
    const row = await this.prisma.client.operatorRuntimeToken.findFirst({
      where: { id: tokenId, workspaceId, widgetId },
    });
    if (!row) throw new NotFoundException('Operator token не найден');
  }

  private toDto(row: {
    id: string;
    name: string;
    tokenPrefix: string;
    allowedDomains: string[];
    expiresAt: Date | null;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
  }): OperatorRuntimeTokenDto {
    return {
      id: row.id,
      name: row.name,
      tokenPrefix: row.tokenPrefix,
      allowedDomains: row.allowedDomains,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
