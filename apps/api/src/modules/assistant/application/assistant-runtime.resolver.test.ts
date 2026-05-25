import { describe, expect, it, vi } from 'vitest';
import { AssistantRuntimeResolver } from './assistant-runtime.resolver';
import type { AssistantWithGraph } from '../infrastructure/assistant.repository';

function mockAssistant(overrides: Partial<AssistantWithGraph> = {}): AssistantWithGraph {
  return {
    id: 'asst-1',
    workspaceId: 'ws-1',
    agentId: 'agent-1',
    name: 'Support Bot',
    slug: 'support-bot',
    description: '',
    avatarUrl: null,
    welcomeMessage: 'Hello',
    placeholder: 'Ask…',
    tone: 'friendly',
    language: 'ru',
    isActive: true,
    visibility: 'INTERNAL',
    behavior: {},
    escalation: null,
    leadCapture: null,
    status: 'ACTIVE',
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    agent: {
      id: 'agent-1',
      name: 'Agent One',
      modelId: 'gpt-4o-mini',
      status: 'ACTIVE',
      integrationId: 'int-1',
      temperature: 0.7,
      topP: 1,
      maxTokens: 4096,
      deletedAt: null,
      integration: { id: 'int-1', name: 'OpenAI', provider: 'OPENAI', status: 'ACTIVE', workspaceId: 'ws-1' },
      activePromptVersion: { id: 'pv-1', version: 1, content: 'You are helpful.' },
    },
    runtimeSettings: {
      assistantId: 'asst-1',
      maxContextMessages: 20,
      memoryEnabled: true,
      citationsEnabled: false,
      moderationEnabled: true,
      fallbackMessage: 'Fallback',
      typingSimulation: true,
      streamingEnabled: true,
      theme: {},
      widgetPosition: 'bottom-right',
      language: 'ru',
      offlineMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    knowledgeBases: [],
    tools: [],
    ...overrides,
  } as AssistantWithGraph;
}

describe('AssistantRuntimeResolver', () => {
  const repo = {
    findById: vi.fn(),
    saveSnapshot: vi.fn().mockResolvedValue({ id: 'snap-1', createdAt: new Date('2026-01-01') }),
  };

  const resolver = new AssistantRuntimeResolver(repo as never);

  it('builds immutable snapshot without secrets', async () => {
    repo.findById.mockResolvedValue(mockAssistant());

    const snapshot = await resolver.resolve('ws-1', 'asst-1', false);

    expect(snapshot.agent.modelId).toBe('gpt-4o-mini');
    expect(snapshot.integration.provider).toBe('OPENAI');
    expect(JSON.stringify(snapshot)).not.toContain('apiKey');
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('rejects inactive integration', async () => {
    repo.findById.mockResolvedValue(
      mockAssistant({
        agent: {
          ...mockAssistant().agent,
          integration: { id: 'int-1', name: 'OpenAI', provider: 'OPENAI', status: 'INVALID' },
        },
      }),
    );

    await expect(resolver.resolve('ws-1', 'asst-1', false)).rejects.toThrow(
      'Интеграция агента не активна',
    );
  });

  it('rejects archived agent', async () => {
    repo.findById.mockResolvedValue(
      mockAssistant({ agent: { ...mockAssistant().agent, status: 'ARCHIVED' } }),
    );

    await expect(resolver.resolve('ws-1', 'asst-1', false)).rejects.toThrow('Агент не активен');
  });

  it('rejects cross-workspace integration', async () => {
    repo.findById.mockResolvedValue(
      mockAssistant({
        agent: {
          ...mockAssistant().agent,
          integration: {
            id: 'int-1',
            name: 'Foreign',
            provider: 'OPENAI',
            status: 'ACTIVE',
            workspaceId: 'ws-other',
          },
        },
      }),
    );

    await expect(resolver.resolve('ws-1', 'asst-1', false)).rejects.toThrow(
      'принадлежит другому workspace',
    );
  });
});
