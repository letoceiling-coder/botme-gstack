import { Injectable } from '@nestjs/common';
import type {
  Assistant,
  AssistantRuntimeSettings,
  KnowledgeBase,
  Prisma,
  Tool,
} from '@botme/database';
import type { RuntimeSettingsInput } from '@botme/shared';
import { WorkspaceScopedRepository } from '../../../core/repository/workspace-scoped.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

export type AssistantWithGraph = Assistant & {
  agent: {
    id: string;
    name: string;
    modelId: string;
    status: string;
    integrationId: string;
    temperature: number;
    topP: number;
    maxTokens: number;
    deletedAt: Date | null;
    integration: { id: string; name: string; provider: string; status: string; workspaceId: string };
    activePromptVersion: { id: string; version: number; content: string } | null;
  };
  runtimeSettings: AssistantRuntimeSettings | null;
  knowledgeBases: Array<{ knowledgeBase: KnowledgeBase }>;
  tools: Array<{ tool: Tool }>;
};

@Injectable()
export class AssistantRepository extends WorkspaceScopedRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  private graphInclude() {
    return {
      agent: {
        include: {
          integration: {
            select: { id: true, name: true, provider: true, status: true, workspaceId: true },
          },
          activePromptVersion: { select: { id: true, version: true, content: true } },
        },
      },
      runtimeSettings: true,
      knowledgeBases: { include: { knowledgeBase: true } },
      tools: { include: { tool: true } },
    };
  }

  findById(workspaceId: string, id: string): Promise<AssistantWithGraph | null> {
    return this.prisma.client.assistant.findFirst({
      where: { ...this.activeScope(workspaceId), id },
      include: this.graphInclude(),
    });
  }

  findBySlug(workspaceId: string, slug: string): Promise<Assistant | null> {
    return this.prisma.client.assistant.findFirst({
      where: { ...this.activeScope(workspaceId), slug },
    });
  }

  listByWorkspace(workspaceId: string): Promise<Assistant[]> {
    return this.prisma.client.assistant.findMany({
      where: this.activeScope(workspaceId),
      orderBy: { updatedAt: 'desc' },
    });
  }

  create(data: Prisma.AssistantCreateInput): Promise<Assistant> {
    return this.prisma.client.assistant.create({ data });
  }

  update(id: string, data: Prisma.AssistantUpdateInput): Promise<Assistant> {
    return this.prisma.client.assistant.update({ where: { id }, data });
  }

  upsertRuntimeSettings(
    assistantId: string,
    data: RuntimeSettingsInput,
  ): Promise<AssistantRuntimeSettings> {
    return this.prisma.client.assistantRuntimeSettings.upsert({
      where: { assistantId },
      create: { assistantId, ...data },
      update: data,
    });
  }

  async softDelete(workspaceId: string, id: string): Promise<Assistant | null> {
    const existing = await this.findById(workspaceId, id);
    if (!existing) return null;
    return this.prisma.client.assistant.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'ARCHIVED', isActive: false },
    });
  }

  async setKnowledgeBases(assistantId: string, knowledgeBaseIds: string[]): Promise<void> {
    await this.prisma.client.assistantKnowledgeBase.deleteMany({ where: { assistantId } });
    if (knowledgeBaseIds.length === 0) return;
    await this.prisma.client.assistantKnowledgeBase.createMany({
      data: knowledgeBaseIds.map((knowledgeBaseId) => ({ assistantId, knowledgeBaseId })),
    });
  }

  async setTools(assistantId: string, toolIds: string[]): Promise<void> {
    await this.prisma.client.assistantTool.deleteMany({ where: { assistantId } });
    if (toolIds.length === 0) return;
    await this.prisma.client.assistantTool.createMany({
      data: toolIds.map((toolId) => ({ assistantId, toolId })),
    });
  }

  saveSnapshot(
    workspaceId: string,
    assistantId: string,
    snapshot: Record<string, unknown>,
  ): Promise<{ id: string; createdAt: Date }> {
    return this.prisma.client.assistantRuntimeSnapshot.create({
      data: {
        workspaceId,
        assistantId,
        snapshot: snapshot as Prisma.InputJsonValue,
      },
      select: { id: true, createdAt: true },
    });
  }

  getSnapshotById(
    workspaceId: string,
    snapshotId: string,
  ): Promise<{ id: string; assistantId: string; snapshot: Prisma.JsonValue } | null> {
    return this.prisma.client.assistantRuntimeSnapshot.findFirst({
      where: { id: snapshotId, workspaceId },
      select: { id: true, assistantId: true, snapshot: true },
    });
  }

  countKnowledgeBases(kbIds: string[], workspaceId: string): Promise<number> {
    return this.prisma.client.knowledgeBase.count({
      where: { id: { in: kbIds }, workspaceId, deletedAt: null, status: 'ACTIVE' },
    });
  }

  countTools(toolIds: string[], workspaceId: string): Promise<number> {
    return this.prisma.client.tool.count({
      where: { id: { in: toolIds }, workspaceId, deletedAt: null, status: 'ACTIVE' },
    });
  }
}
