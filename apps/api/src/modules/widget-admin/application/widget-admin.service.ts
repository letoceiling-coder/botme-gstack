import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    const assistant = await this.assistants.findById(workspaceId, input.assistantId);
    if (!assistant) throw new NotFoundException('Ассистент не найден');

    const row = await this.widgets.create({
      workspace: { connect: { id: workspaceId } },
      assistant: { connect: { id: input.assistantId } },
      publicKey: this.widgets.generatePublicKey(),
      name: input.name,
      launcherConfig: (input.launcherConfig ?? DEFAULT_LAUNCHER_CONFIG) as Prisma.InputJsonValue,
      domains: {
        create: input.domains.map((domain) => ({ domain: domain.toLowerCase() })),
      },
    });

    await this.audit.logWidgetDomainChange(workspaceId, userId, row.id, { domains: input.domains });
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

    const data: Prisma.WidgetInstanceUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.launcherConfig !== undefined) data.launcherConfig = input.launcherConfig as Prisma.InputJsonValue;
    if (input.assistantId !== undefined) data.assistant = { connect: { id: input.assistantId } };

    const row = await this.widgets.update(workspaceId, id, data);
    return toWidgetDetailDto(row);
  }

  async updateDomains(
    workspaceId: string,
    userId: string,
    id: string,
    body: unknown,
  ): Promise<WidgetDetailDto> {
    const input = UpdateWidgetDomainsSchema.parse(body);
    const existing = await this.widgets.findById(workspaceId, id);
    if (!existing) throw new NotFoundException('Виджет не найден');

    await this.widgets.replaceDomains(id, input.domains);
    await this.audit.logWidgetDomainChange(workspaceId, userId, id, { domains: input.domains });
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
}
