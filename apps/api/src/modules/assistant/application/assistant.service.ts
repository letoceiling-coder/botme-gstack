import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AssistantDetailDto,
  AssistantDto,
  CreateAssistantInput,
  RuntimeSettingsInput,
  UpdateAssistantInput,
} from '@botme/shared';
import { AgentRepository } from '../../agent/infrastructure/agent.repository';
import type { Prisma } from '@botme/database';
import { Prisma as PrismaNamespace } from '@botme/database';
import { AssistantRuntimeResolver } from './assistant-runtime.resolver';
import {
  AssistantRepository,
  type AssistantWithGraph,
} from '../infrastructure/assistant.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class AssistantService {
  constructor(
    private readonly assistants: AssistantRepository,
    private readonly agents: AgentRepository,
    private readonly runtimeResolver: AssistantRuntimeResolver,
    private readonly prisma: PrismaService,
  ) {}

  async list(workspaceId: string): Promise<AssistantDto[]> {
    const rows = await this.assistants.listByWorkspace(workspaceId);
    const result: AssistantDto[] = [];
    for (const row of rows) {
      const detail = await this.assistants.findById(workspaceId, row.id);
      if (detail) result.push(this.toDto(detail));
    }
    return result;
  }

  async get(workspaceId: string, id: string): Promise<AssistantDetailDto> {
    const row = await this.assistants.findById(workspaceId, id);
    if (!row) throw new NotFoundException('Ассистент не найден');
    return this.toDetailDto(row);
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateAssistantInput,
  ): Promise<AssistantDetailDto> {
    await this.validateAgentBinding(workspaceId, input.agentId);

    const slug = input.slug ?? this.slugify(input.name);
    const existingSlug = await this.assistants.findBySlug(workspaceId, slug);
    if (existingSlug) {
      throw new BadRequestException('Slug уже занят');
    }

    const assistant = await this.prisma.client.$transaction(async (tx) => {
      const requestedActive = input.isActive ?? true;
      const created = await tx.assistant.create({
        data: {
          workspace: { connect: { id: workspaceId } },
          agent: { connect: { id: input.agentId } },
          createdByUser: { connect: { id: userId } },
          name: input.name,
          slug,
          description: input.description ?? '',
          avatarUrl: input.avatarUrl || null,
          welcomeMessage: input.welcomeMessage ?? '',
          placeholder: input.placeholder ?? '',
          tone: input.tone ?? 'neutral',
          language: input.language ?? 'ru',
          visibility: input.visibility ?? 'INTERNAL',
          isActive: requestedActive,
          status: requestedActive ? 'ACTIVE' : 'DRAFT',
        },
      });

      await tx.assistantRuntimeSettings.create({
        data: {
          assistantId: created.id,
          ...this.runtimeDefaults(input.runtimeSettings),
        },
      });

      return created;
    });

    return this.get(workspaceId, assistant.id);
  }

  async update(
    workspaceId: string,
    id: string,
    input: UpdateAssistantInput,
  ): Promise<AssistantDetailDto> {
    const existing = await this.assistants.findById(workspaceId, id);
    if (!existing) throw new NotFoundException('Ассистент не найден');

    if (input.slug && input.slug !== existing.slug) {
      const taken = await this.assistants.findBySlug(workspaceId, input.slug);
      if (taken && taken.id !== id) {
        throw new BadRequestException('Slug уже занят');
      }
    }

    const updateData: Prisma.AssistantUpdateInput = {
      name: input.name,
      slug: input.slug,
      description: input.description,
      avatarUrl: input.avatarUrl === null ? null : input.avatarUrl,
      welcomeMessage: input.welcomeMessage,
      placeholder: input.placeholder,
      tone: input.tone,
      language: input.language,
      visibility: input.visibility,
      isActive: input.isActive,
      status: input.status ?? (input.isActive ? 'ACTIVE' : undefined),
    };
    if (input.behavior !== undefined) {
      updateData.behavior = input.behavior as Prisma.InputJsonValue;
    }
    if (input.escalation !== undefined) {
      updateData.escalation =
        input.escalation === null
          ? PrismaNamespace.JsonNull
          : (input.escalation as Prisma.InputJsonValue);
    }
    await this.assistants.update(id, updateData);

    if (input.runtimeSettings) {
      await this.assistants.upsertRuntimeSettings(id, input.runtimeSettings);
    }

    return this.get(workspaceId, id);
  }

  async remove(workspaceId: string, id: string): Promise<{ ok: true }> {
    const deleted = await this.assistants.softDelete(workspaceId, id);
    if (!deleted) throw new NotFoundException('Ассистент не найден');
    return { ok: true };
  }

  async bindAgent(workspaceId: string, id: string, agentId: string): Promise<AssistantDetailDto> {
    const existing = await this.assistants.findById(workspaceId, id);
    if (!existing) throw new NotFoundException('Ассистент не найден');

    await this.validateAgentBinding(workspaceId, agentId);
    await this.assistants.update(id, { agent: { connect: { id: agentId } } });
    return this.get(workspaceId, id);
  }

  async bindKnowledgeBases(
    workspaceId: string,
    id: string,
    knowledgeBaseIds: string[],
  ): Promise<AssistantDetailDto> {
    const existing = await this.assistants.findById(workspaceId, id);
    if (!existing) throw new NotFoundException('Ассистент не найден');

    if (knowledgeBaseIds.length > 0) {
      const count = await this.assistants.countKnowledgeBases(knowledgeBaseIds, workspaceId);
      if (count !== knowledgeBaseIds.length) {
        throw new BadRequestException('Одна или несколько баз знаний недоступны');
      }
    }

    await this.assistants.setKnowledgeBases(id, knowledgeBaseIds);
    return this.get(workspaceId, id);
  }

  async bindTools(
    workspaceId: string,
    id: string,
    toolIds: string[],
  ): Promise<AssistantDetailDto> {
    const existing = await this.assistants.findById(workspaceId, id);
    if (!existing) throw new NotFoundException('Ассистент не найден');

    if (toolIds.length > 0) {
      const count = await this.assistants.countTools(toolIds, workspaceId);
      if (count !== toolIds.length) {
        throw new BadRequestException('Один или несколько инструментов недоступны');
      }
    }

    await this.assistants.setTools(id, toolIds);
    return this.get(workspaceId, id);
  }

  resolveRuntime(workspaceId: string, id: string) {
    return this.runtimeResolver.resolve(workspaceId, id, true);
  }

  private async validateAgentBinding(workspaceId: string, agentId: string): Promise<void> {
    const agent = await this.agents.findById(workspaceId, agentId);
    if (!agent) {
      throw new BadRequestException('Агент не найден');
    }
    if (agent.status !== 'ACTIVE' || agent.deletedAt) {
      throw new BadRequestException('Агент не активен');
    }
    if (agent.integration.status !== 'ACTIVE') {
      throw new BadRequestException('Интеграция агента не активна');
    }
    if (agent.integration.workspaceId !== workspaceId) {
      throw new BadRequestException('Интеграция агента принадлежит другому workspace');
    }
    if (!agent.activePromptVersion) {
      throw new BadRequestException('У агента нет активной версии промпта');
    }
  }

  private runtimeDefaults(input?: RuntimeSettingsInput) {
    return {
      maxContextMessages: input?.maxContextMessages ?? 20,
      memoryEnabled: input?.memoryEnabled ?? true,
      citationsEnabled: input?.citationsEnabled ?? false,
      moderationEnabled: input?.moderationEnabled ?? true,
      fallbackMessage: input?.fallbackMessage ?? 'Извините, я не могу ответить сейчас.',
      typingSimulation: input?.typingSimulation ?? true,
      streamingEnabled: input?.streamingEnabled ?? true,
      widgetPosition: input?.widgetPosition ?? 'bottom-right',
      offlineMessage: input?.offlineMessage ?? null,
    };
  }

  private slugify(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9\u0400-\u04FF]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${base || 'assistant'}-${suffix}`;
  }

  private toDto(row: AssistantWithGraph): AssistantDto {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      agentId: row.agentId,
      agentName: row.agent.name,
      avatarUrl: row.avatarUrl,
      welcomeMessage: row.welcomeMessage,
      placeholder: row.placeholder,
      tone: row.tone,
      language: row.language,
      isActive: row.isActive,
      visibility: row.visibility,
      status: row.status,
      knowledgeBaseCount: row.knowledgeBases.length,
      toolCount: row.tools.length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetailDto(row: AssistantWithGraph): AssistantDetailDto {
    const settings = row.runtimeSettings;
    return {
      ...this.toDto(row),
      runtimeSettings: {
        maxContextMessages: settings?.maxContextMessages ?? 20,
        memoryEnabled: settings?.memoryEnabled ?? true,
        citationsEnabled: settings?.citationsEnabled ?? false,
        moderationEnabled: settings?.moderationEnabled ?? true,
        fallbackMessage: settings?.fallbackMessage ?? 'Извините, я не могу ответить сейчас.',
        typingSimulation: settings?.typingSimulation ?? true,
        streamingEnabled: settings?.streamingEnabled ?? true,
        widgetPosition: settings?.widgetPosition ?? 'bottom-right',
        language: settings?.language ?? row.language,
        offlineMessage: settings?.offlineMessage ?? null,
      },
      knowledgeBaseIds: row.knowledgeBases.map((kb) => kb.knowledgeBase.id),
      toolIds: row.tools.map((t) => t.tool.id),
      behavior: (row.behavior as Record<string, unknown>) ?? {},
      escalation: (row.escalation as Record<string, unknown> | null) ?? null,
    };
  }
}
