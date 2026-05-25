import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AssistantRuntimeSnapshotDto } from '@botme/shared';
import { AssistantRepository, type AssistantWithGraph } from '../infrastructure/assistant.repository';

@Injectable()
export class AssistantRuntimeResolver {
  constructor(private readonly assistants: AssistantRepository) {}

  async resolve(
    workspaceId: string,
    assistantId: string,
    persist = true,
  ): Promise<AssistantRuntimeSnapshotDto> {
    const assistant = await this.assistants.findById(workspaceId, assistantId);
    if (!assistant) {
      throw new NotFoundException('Ассистент не найден');
    }

    this.validateGraph(assistant, workspaceId);

    const snapshotBody = this.buildSnapshot(assistant);
    const frozen = Object.freeze(structuredClone(snapshotBody)) as typeof snapshotBody;

    let snapshotId = 'ephemeral';
    let resolvedAt = new Date().toISOString();

    if (persist) {
      const row = await this.assistants.saveSnapshot(workspaceId, assistantId, frozen);
      snapshotId = row.id;
      resolvedAt = row.createdAt.toISOString();
    }

    return Object.freeze({
      snapshotId,
      assistantId,
      resolvedAt,
      ...frozen,
    }) as AssistantRuntimeSnapshotDto;
  }

  validateGraph(assistant: AssistantWithGraph, workspaceId: string): void {
    if (assistant.workspaceId !== workspaceId) {
      throw new BadRequestException('Cross-workspace access denied');
    }

    if (assistant.agent.deletedAt) {
      throw new BadRequestException('Агент удалён');
    }

    if (assistant.agent.status !== 'ACTIVE') {
      throw new BadRequestException('Агент не активен');
    }

    if (assistant.agent.integration.status !== 'ACTIVE') {
      throw new BadRequestException('Интеграция агента не активна');
    }

    if (assistant.agent.integration.workspaceId !== workspaceId) {
      throw new BadRequestException('Интеграция агента принадлежит другому workspace');
    }

    if (!assistant.agent.activePromptVersion) {
      throw new BadRequestException('У агента нет активной версии промпта');
    }

    for (const kb of assistant.knowledgeBases) {
      if (kb.knowledgeBase.workspaceId !== workspaceId || kb.knowledgeBase.deletedAt) {
        throw new BadRequestException('Недопустимая привязка базы знаний');
      }
    }

    for (const t of assistant.tools) {
      if (t.tool.workspaceId !== workspaceId || t.tool.deletedAt) {
        throw new BadRequestException('Недопустимая привязка инструмента');
      }
    }
  }

  private buildSnapshot(assistant: AssistantWithGraph) {
    const settings = assistant.runtimeSettings;
    return {
      assistant: {
        id: assistant.id,
        name: assistant.name,
        slug: assistant.slug,
        welcomeMessage: assistant.welcomeMessage,
        placeholder: assistant.placeholder,
        tone: assistant.tone,
        language: assistant.language,
        visibility: assistant.visibility,
        isActive: assistant.isActive,
      },
      agent: {
        id: assistant.agent.id,
        name: assistant.agent.name,
        modelId: assistant.agent.modelId,
        temperature: assistant.agent.temperature,
        topP: assistant.agent.topP,
        maxTokens: assistant.agent.maxTokens,
        status: assistant.agent.status,
      },
      promptVersion: {
        id: assistant.agent.activePromptVersion!.id,
        version: assistant.agent.activePromptVersion!.version,
        content: assistant.agent.activePromptVersion!.content,
      },
      integration: {
        id: assistant.agent.integration.id,
        name: assistant.agent.integration.name,
        provider: assistant.agent.integration.provider,
        status: assistant.agent.integration.status,
      },
      knowledgeBases: assistant.knowledgeBases
        .filter((kb) => kb.knowledgeBase.status === 'ACTIVE' && !kb.knowledgeBase.deletedAt)
        .map((kb) => ({
          id: kb.knowledgeBase.id,
          name: kb.knowledgeBase.name,
          description: kb.knowledgeBase.description,
          status: kb.knowledgeBase.status,
        })),
      tools: assistant.tools
        .filter((t) => t.tool.status === 'ACTIVE' && !t.tool.deletedAt && t.tool.enabled)
        .map((t) => ({
          id: t.tool.id,
          name: t.tool.name,
          description: t.tool.description,
          type: t.tool.type,
          status: t.tool.status,
          schema: t.tool.schema as Record<string, unknown>,
        })),
      runtimeSettings: {
        maxContextMessages: settings?.maxContextMessages ?? 20,
        memoryEnabled: settings?.memoryEnabled ?? true,
        citationsEnabled: settings?.citationsEnabled ?? false,
        moderationEnabled: settings?.moderationEnabled ?? true,
        fallbackMessage: settings?.fallbackMessage ?? 'Извините, я не могу ответить сейчас.',
        typingSimulation: settings?.typingSimulation ?? true,
        streamingEnabled: settings?.streamingEnabled ?? true,
        widgetPosition: settings?.widgetPosition ?? 'bottom-right',
        language: settings?.language ?? assistant.language,
        offlineMessage: settings?.offlineMessage ?? null,
      },
    };
  }
}
