import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AgentDetailDto,
  AgentDto,
  CreateAgentInput,
  CreatePromptVersionInput,
  PromptVersionDto,
  UpdateAgentInput,
} from '@botme/shared';
import { IntegrationRepository } from '../../foundation/infrastructure/integration.repository';
import { AuditService } from '../../foundation/application/audit.service';
import { AgentRepository, type AgentWithIntegration } from '../infrastructure/agent.repository';
import { AgentModelFallbackRepository } from '../infrastructure/agent-model-fallback.repository';
import { AgentModelRuntimeRouter } from './agent-model-runtime-router.service';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class AgentService {
  constructor(
    private readonly agents: AgentRepository,
    private readonly fallbacks: AgentModelFallbackRepository,
    private readonly modelRouter: AgentModelRuntimeRouter,
    private readonly integrations: IntegrationRepository,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async list(workspaceId: string): Promise<AgentDto[]> {
    const rows = await this.agents.listByWorkspace(workspaceId);
    const result: AgentDto[] = [];
    for (const row of rows) {
      const detail = await this.agents.findById(workspaceId, row.id);
      if (detail) result.push(await this.toDto(detail, workspaceId));
    }
    return result;
  }

  async get(workspaceId: string, id: string): Promise<AgentDetailDto> {
    const row = await this.agents.findById(workspaceId, id);
    if (!row) throw new NotFoundException('Агент не найден');
    return this.toDetailDto(row, workspaceId);
  }

  getRuntimeDiagnostics(workspaceId: string, id: string) {
    return this.modelRouter.getDiagnostics(workspaceId, id);
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateAgentInput,
    ip?: string,
  ): Promise<AgentDetailDto> {
    const integration = await this.integrations.findById(workspaceId, input.integrationId);
    if (!integration || integration.status !== 'ACTIVE') {
      throw new BadRequestException('Интеграция недоступна');
    }
    this.validateFallbacks(input.integrationId, input.fallbacks);
    await this.validateFallbackIntegrations(workspaceId, input.fallbacks);

    const agent = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.agent.create({
        data: {
          workspace: { connect: { id: workspaceId } },
          integration: { connect: { id: input.integrationId } },
          modelId: input.modelId,
          name: input.name,
          description: input.description ?? '',
          temperature: input.temperature ?? 0.7,
          topP: input.topP ?? 1,
          maxTokens: input.maxTokens ?? 4096,
          systemPrompt: input.systemPrompt,
          status: 'ACTIVE',
        },
      });

      const version = await tx.agentPromptVersion.create({
        data: {
          agent: { connect: { id: created.id } },
          version: 1,
          content: input.systemPrompt,
          createdByUser: { connect: { id: userId } },
        },
      });

      return tx.agent.update({
        where: { id: created.id },
        data: { activePromptVersionId: version.id },
      });
    });

    if (input.fallbacks?.length) {
      await this.fallbacks.replaceForAgent(
        workspaceId,
        agent.id,
        input.fallbacks.map((f, i) => ({
          position: i + 1,
          integrationId: f.integrationId,
          modelId: f.modelId,
          enabled: f.enabled,
          maxRetries: f.maxRetries,
          timeoutMs: f.timeoutMs,
        })),
      );
    }

    await this.audit.logAgentPromptVersion(workspaceId, userId, agent.id, 1, ip);
    return this.get(workspaceId, agent.id);
  }

  async update(
    workspaceId: string,
    userId: string,
    id: string,
    input: UpdateAgentInput,
    ip?: string,
  ): Promise<AgentDetailDto> {
    const existing = await this.agents.findById(workspaceId, id);
    if (!existing) throw new NotFoundException('Агент не найден');

    const integrationId = input.integrationId ?? existing.integrationId;
    if (input.integrationId) {
      const integration = await this.integrations.findById(workspaceId, input.integrationId);
      if (!integration || integration.status !== 'ACTIVE') {
        throw new BadRequestException('Интеграция недоступна');
      }
    }
    if (input.fallbacks) {
      this.validateFallbacks(integrationId, input.fallbacks);
      await this.validateFallbackIntegrations(workspaceId, input.fallbacks);
    }

    await this.agents.update(id, {
      name: input.name,
      description: input.description,
      integration: input.integrationId ? { connect: { id: input.integrationId } } : undefined,
      modelId: input.modelId,
      temperature: input.temperature,
      topP: input.topP,
      maxTokens: input.maxTokens,
      status: input.status,
      streamingEnabled: input.streamingEnabled,
      toolsEnabled: input.toolsEnabled,
    });

    if (input.fallbacks) {
      await this.fallbacks.replaceForAgent(
        workspaceId,
        id,
        input.fallbacks.map((f, i) => ({
          position: i + 1,
          integrationId: f.integrationId,
          modelId: f.modelId,
          enabled: f.enabled,
          maxRetries: f.maxRetries,
          timeoutMs: f.timeoutMs,
        })),
      );
    }

    void userId;
    void ip;
    return this.get(workspaceId, id);
  }

  async remove(workspaceId: string, userId: string, id: string, ip?: string): Promise<{ ok: true }> {
    const deleted = await this.agents.softDelete(workspaceId, id);
    if (!deleted) throw new NotFoundException('Агент не найден');
    void userId;
    void ip;
    return { ok: true };
  }

  async createPromptVersion(
    workspaceId: string,
    userId: string,
    agentId: string,
    input: CreatePromptVersionInput,
    ip?: string,
  ): Promise<AgentDetailDto> {
    const agent = await this.agents.findById(workspaceId, agentId);
    if (!agent) throw new NotFoundException('Агент не найден');

    const versionNumber = await this.agents.getNextVersionNumber(agentId);
    const version = await this.agents.createPromptVersion({
      agent: { connect: { id: agentId } },
      version: versionNumber,
      content: input.content,
      createdByUser: { connect: { id: userId } },
    });

    await this.audit.logAgentPromptVersion(workspaceId, userId, agentId, versionNumber, ip);

    if (input.activate) {
      await this.agents.setActivePromptVersion(agentId, version.id, input.content);
    }

    return this.get(workspaceId, agentId);
  }

  async activatePromptVersion(
    workspaceId: string,
    userId: string,
    agentId: string,
    versionNumber: number,
    ip?: string,
  ): Promise<AgentDetailDto> {
    const agent = await this.agents.findById(workspaceId, agentId);
    if (!agent) throw new NotFoundException('Агент не найден');

    const version = await this.agents.findPromptVersion(agentId, versionNumber);
    if (!version) throw new NotFoundException('Версия промпта не найдена');

    await this.agents.setActivePromptVersion(agentId, version.id, version.content);
    await this.audit.logAgentPromptActivated(workspaceId, userId, agentId, versionNumber, ip);
    return this.get(workspaceId, agentId);
  }

  resolveSystemPrompt(agent: AgentWithIntegration, promptVersionId?: string): string {
    if (promptVersionId) {
      const version = agent.promptVersions.find((v) => v.id === promptVersionId);
      if (!version) throw new BadRequestException('Версия промпта не найдена');
      return version.content;
    }
    return agent.activePromptVersion?.content ?? agent.systemPrompt;
  }

  private validateFallbacks(
    primaryIntegrationId: string,
    fallbacks?: CreateAgentInput['fallbacks'],
  ): void {
    if (!fallbacks?.length) return;
    const seen = new Set<string>();
    for (const f of fallbacks) {
      const key = `${f.integrationId}:${f.modelId}`;
      if (seen.has(key)) throw new BadRequestException('Дубликаты в цепочке fallback');
      seen.add(key);
      if (f.integrationId === primaryIntegrationId && f.modelId) {
        // allow same integration different model
      }
    }
  }

  private async validateFallbackIntegrations(
    workspaceId: string,
    fallbacks?: CreateAgentInput['fallbacks'],
  ): Promise<void> {
    if (!fallbacks?.length) return;
    for (const f of fallbacks) {
      const integration = await this.integrations.findById(workspaceId, f.integrationId);
      if (!integration || integration.status !== 'ACTIVE') {
        throw new BadRequestException('Fallback-интеграция недоступна');
      }
    }
  }

  private async toDto(row: AgentWithIntegration, workspaceId: string): Promise<AgentDto> {
    const fb = await this.fallbacks.listByAgent(workspaceId, row.id);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      integrationId: row.integrationId,
      integrationName: row.integration.name,
      modelId: row.modelId,
      temperature: row.temperature,
      topP: row.topP,
      maxTokens: row.maxTokens,
      systemPrompt: row.systemPrompt,
      status: row.status,
      streamingEnabled: row.streamingEnabled,
      toolsEnabled: row.toolsEnabled,
      activePromptVersionId: row.activePromptVersionId,
      activeVersion: row.activePromptVersion?.version ?? null,
      fallbacks: this.modelRouter.toFallbackDtos(fb),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async toDetailDto(row: AgentWithIntegration, workspaceId: string): Promise<AgentDetailDto> {
    return {
      ...(await this.toDto(row, workspaceId)),
      promptVersions: row.promptVersions.map((v) => this.toVersionDto(v, row.activePromptVersionId)),
    };
  }

  private toVersionDto(
    v: AgentWithIntegration['promptVersions'][number],
    activeId: string | null,
  ): PromptVersionDto {
    return {
      id: v.id,
      version: v.version,
      content: v.content,
      createdBy: v.createdBy,
      createdByName: v.createdByUser.name ?? '—',
      isActive: v.id === activeId,
      createdAt: v.createdAt.toISOString(),
    };
  }
}
