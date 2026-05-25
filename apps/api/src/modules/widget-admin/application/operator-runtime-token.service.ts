import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { EnvelopeEncryptionService, hashToken } from '@botme/crypto';
import type {
  CreateOperatorRuntimeTokenInput,
  JwtPayload,
  OperatorRuntimeSessionDto,
  OperatorRuntimeTokenDto,
  UpdateOperatorRuntimeTokenInput,
} from '@botme/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { OperatorSocketBridge } from '../../realtime/services/operator-socket-bridge.service';

function generatePlainToken(): string {
  return `ort_live_${randomBytes(24).toString('base64url')}`;
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
  private readonly logger = new Logger(OperatorRuntimeTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly operatorBridge: OperatorSocketBridge,
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
    return this.insertToken(workspaceId, widgetId, userId, input.name, input.allowedDomains, input.expiresInDays, false);
  }

  async ensureDefaultToken(
    workspaceId: string,
    widgetId: string,
    userId: string,
    allowedDomains: string[],
  ): Promise<{ dto: OperatorRuntimeTokenDto; plainToken: string }> {
    await this.assertWidget(workspaceId, widgetId);

    const active = await this.prisma.client.operatorRuntimeToken.findFirst({
      where: {
        workspaceId,
        widgetId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    if (active?.tokenEncrypted) {
      const plainToken = this.decryptStoredToken(Buffer.from(active.tokenEncrypted), workspaceId, active.keyVersion);
      return { dto: this.toDto(active), plainToken };
    }

    if (active && !active.tokenEncrypted) {
      await this.revokeInternal(active.id);
    }

    const created = await this.insertToken(
      workspaceId,
      widgetId,
      userId,
      'Подключение по умолчанию',
      allowedDomains,
      undefined,
      true,
    );
    return {
      dto: created,
      plainToken: created.plainToken ?? '',
    };
  }

  async regenerate(
    workspaceId: string,
    widgetId: string,
    userId: string,
  ): Promise<{ dto: OperatorRuntimeTokenDto; plainToken: string }> {
    await this.assertWidget(workspaceId, widgetId);
    const widget = await this.prisma.client.widgetInstance.findFirst({
      where: { id: widgetId, workspaceId },
      include: { domains: true },
    });
    const allowedDomains = widget?.domains.map((d) => d.domain) ?? [];
    const active = await this.prisma.client.operatorRuntimeToken.findMany({
      where: { workspaceId, widgetId, revokedAt: null },
      select: { id: true },
    });
    for (const row of active) {
      await this.revokeInternal(row.id);
    }
    return this.ensureDefaultToken(workspaceId, widgetId, userId, allowedDomains);
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
    await this.revokeInternal(tokenId);
    return { ok: true };
  }

  async getPlainTokenForAdmin(workspaceId: string, widgetId: string): Promise<string | null> {
    const row = await this.prisma.client.operatorRuntimeToken.findFirst({
      where: {
        workspaceId,
        widgetId,
        revokedAt: null,
        tokenEncrypted: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    if (!row?.tokenEncrypted) return null;
    return this.decryptStoredToken(Buffer.from(row.tokenEncrypted), workspaceId, row.keyVersion);
  }

  async getActiveForWidget(workspaceId: string, widgetId: string): Promise<OperatorRuntimeTokenDto | null> {
    const row = await this.prisma.client.operatorRuntimeToken.findFirst({
      where: {
        workspaceId,
        widgetId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
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
      data: {
        lastUsedAt: new Date(),
        exchangeCount: { increment: 1 },
      },
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

  private async insertToken(
    workspaceId: string,
    widgetId: string,
    userId: string,
    name: string,
    allowedDomains: string[],
    expiresInDays: number | undefined,
    isDefault: boolean,
  ): Promise<OperatorRuntimeTokenDto> {
    const plainToken = generatePlainToken();
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null;
    const encrypted = this.encryptStoredToken(plainToken, workspaceId);

    const row = await this.prisma.client.operatorRuntimeToken.create({
      data: {
        workspaceId,
        widgetId,
        name,
        tokenHash: hashToken(plainToken),
        tokenPrefix: plainToken.slice(0, 20),
        tokenEncrypted: new Uint8Array(encrypted),
        keyVersion: 1,
        allowedDomains,
        expiresAt,
        isDefault,
        createdById: userId,
      },
    });

    return { ...this.toDto(row), plainToken };
  }

  private async revokeInternal(tokenId: string): Promise<void> {
    await this.prisma.client.operatorRuntimeToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });
    const disconnected = this.operatorBridge.disconnectByRuntimeTokenId(tokenId);
    if (disconnected > 0) {
      this.logger.log(`Revoked operator token ${tokenId}, disconnected ${disconnected} socket(s)`);
    }
  }

  private encryptStoredToken(plainToken: string, workspaceId: string): Buffer {
    const crypto = this.getCrypto();
    return crypto.pack(crypto.encrypt(plainToken, workspaceId));
  }

  private decryptStoredToken(encrypted: Buffer, workspaceId: string, keyVersion: number): string {
    const crypto = this.getCrypto();
    return crypto.decrypt(crypto.unpack(encrypted, keyVersion), workspaceId);
  }

  private getCrypto(): EnvelopeEncryptionService {
    const masterKey = this.config.get<string>('MASTER_ENCRYPTION_KEY');
    if (!masterKey || masterKey.length !== 64) {
      throw new Error('MASTER_ENCRYPTION_KEY must be configured (64 hex chars)');
    }
    return new EnvelopeEncryptionService(masterKey);
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
    exchangeCount: number;
    isDefault: boolean;
    createdAt: Date;
  }): OperatorRuntimeTokenDto {
    return {
      id: row.id,
      name: row.name,
      tokenPrefix: `${row.tokenPrefix}…`,
      allowedDomains: row.allowedDomains,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      exchangeCount: row.exchangeCount,
      isDefault: row.isDefault,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
