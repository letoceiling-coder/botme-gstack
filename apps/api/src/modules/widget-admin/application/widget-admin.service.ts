import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@botme/database';
import {
  CreateWidgetSchema,
  DEFAULT_LAUNCHER_CONFIG,
  UpdateWidgetDomainsSchema,
  UpdateWidgetSchema,
  type WidgetDetailDto,
  type WidgetDto,
} from '@botme/shared';
import { AuditService } from '../../foundation/application/audit.service';
import { WidgetPreviewTokenService } from '../../foundation/application/widget-preview-token.service';
import { AssistantRepository } from '../../assistant/infrastructure/assistant.repository';
import { S3StorageService } from '../../../core/storage/s3-storage.service';
import {
  toWidgetDetailDto,
  toWidgetDto,
  WidgetAdminRepository,
} from '../infrastructure/widget-admin.repository';

@Injectable()
export class WidgetAdminService {
  constructor(
    private readonly widgets: WidgetAdminRepository,
    private readonly assistants: AssistantRepository,
    private readonly audit: AuditService,
    private readonly previewTokens: WidgetPreviewTokenService,
    private readonly config: ConfigService,
    private readonly storage: S3StorageService,
  ) {}

  async list(workspaceId: string): Promise<WidgetDto[]> {
    const rows = await this.widgets.list(workspaceId);
    return rows.map((r) => toWidgetDto(r));
  }

  async get(workspaceId: string, id: string): Promise<WidgetDetailDto> {
    const row = await this.widgets.findById(workspaceId, id);
    if (!row) throw new NotFoundException('Виджет не найден');
    return toWidgetDetailDto(row);
  }

  async getPreviewSession(workspaceId: string, userId: string, id: string) {
    const row = await this.widgets.findById(workspaceId, id);
    if (!row) throw new NotFoundException('Виджет не найден');
    const appOrigin = this.config.get<string>('WEB_URL', 'https://agent.neeklo.ru');
    return this.previewTokens.issue({
      widgetId: row.id,
      workspaceId,
      publicKey: row.publicKey,
      userId,
      appOrigin,
    });
  }

  async create(workspaceId: string, userId: string, body: unknown): Promise<WidgetDetailDto> {
    const input = CreateWidgetSchema.parse(body);
    const domains = this.normalizeDomains(input.domains);
    if (domains.length === 0) {
      throw new BadRequestException('Укажите хотя бы один корректный домен сайта');
    }
    const assistant = await this.assistants.findById(workspaceId, input.assistantId);
    if (!assistant) throw new NotFoundException('Ассистент не найден');
    await this.publishAssistantIfNeeded(input.assistantId);

    const row = await this.widgets.create({
      workspace: { connect: { id: workspaceId } },
      assistant: { connect: { id: input.assistantId } },
      publicKey: this.widgets.generatePublicKey(),
      name: input.name,
      launcherConfig: (input.launcherConfig ?? DEFAULT_LAUNCHER_CONFIG) as Prisma.InputJsonValue,
      domains: {
        create: domains.map((domain) => ({ domain })),
      },
    });

    await this.audit.logWidgetDomainChange(workspaceId, userId, row.id, { domains });
    return toWidgetDetailDto(row);
  }

  async update(workspaceId: string, id: string, body: unknown): Promise<WidgetDetailDto> {
    const input = UpdateWidgetSchema.parse(body);
    const existing = await this.widgets.findById(workspaceId, id);
    if (!existing) throw new NotFoundException('Виджет не найден');

    if (input.assistantId) {
      const assistant = await this.assistants.findById(workspaceId, input.assistantId);
      if (!assistant) throw new NotFoundException('Ассистент не найден');
    }

    const assistantIdToPublish = input.assistantId ?? existing.assistantId;
    if (input.isActive === true || input.assistantId !== undefined) {
      await this.publishAssistantIfNeeded(assistantIdToPublish);
    }

    const data: Prisma.WidgetInstanceUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.launcherConfig !== undefined) data.launcherConfig = input.launcherConfig as Prisma.InputJsonValue;
    if (input.assistantId !== undefined) data.assistant = { connect: { id: input.assistantId } };

    const row = await this.widgets.update(workspaceId, id, data);
    return toWidgetDetailDto(row);
  }

  private async publishAssistantIfNeeded(assistantId: string): Promise<void> {
    await this.widgets.publishAssistant(assistantId);
  }

  async uploadLauncherIcon(
    workspaceId: string,
    id: string,
    file: { buffer: Buffer; originalname: string; mimetype?: string; size: number },
  ): Promise<{ url: string }> {
    const existing = await this.widgets.findById(workspaceId, id);
    if (!existing) throw new NotFoundException('Виджет не найден');

    const mimeType = file.mimetype ?? '';
    if (mimeType !== 'image/png' && mimeType !== 'image/svg+xml') {
      throw new BadRequestException('Поддерживаются только SVG и PNG');
    }

    const extension = mimeType === 'image/png' ? 'png' : 'svg';
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const storageKey = `workspaces/${workspaceId}/widget-assets/${id}/${randomUUID()}-${safeName || `launcher.${extension}`}`;
    await this.storage.putObject(storageKey, file.buffer, mimeType);
    return { url: this.storage.buildPublicUrl(storageKey) };
  }

  async updateDomains(
    workspaceId: string,
    userId: string,
    id: string,
    body: unknown,
  ): Promise<WidgetDetailDto> {
    const input = UpdateWidgetDomainsSchema.parse(body);
    const domains = this.normalizeDomains(input.domains);
    if (domains.length === 0) {
      throw new BadRequestException('Укажите хотя бы один корректный домен сайта');
    }
    const existing = await this.widgets.findById(workspaceId, id);
    if (!existing) throw new NotFoundException('Виджет не найден');

    await this.widgets.replaceDomains(id, domains);
    await this.audit.logWidgetDomainChange(workspaceId, userId, id, { domains });
    const row = await this.widgets.findById(workspaceId, id);
    if (!row) throw new NotFoundException('Виджет не найден');
    return toWidgetDetailDto(row);
  }

  async remove(workspaceId: string, id: string): Promise<{ ok: boolean }> {
    const existing = await this.widgets.findById(workspaceId, id);
    if (!existing) throw new NotFoundException('Виджет не найден');
    await this.widgets.softDelete(workspaceId, id);
    return { ok: true };
  }

  private normalizeDomains(domains: string[]): string[] {
    const normalized = domains
      .map((domain) => this.normalizeDomain(domain))
      .filter((domain) => domain.length > 0);
    return [...new Set(normalized)];
  }

  private normalizeDomain(domain: string): string {
    const raw = domain.trim().toLowerCase();
    if (!raw) return '';

    try {
      const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
      return url.hostname;
    } catch {
      return raw.split('/')[0]?.split(':')[0] ?? '';
    }
  }
}
