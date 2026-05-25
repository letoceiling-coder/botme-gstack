import type {
  AgentDetailDto,
  AgentDto,
  AuthSession,
  IntegrationDto,
  ModelCacheDto,
  PlaygroundSessionDto,
  ValidateIntegrationResult,
} from '@botme/shared';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type SessionResponse = AuthSession & { expiresIn?: number };

let refreshPromise: Promise<SessionResponse | null> | null = null;

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(body.message) ? body.message[0] : body.message;
  return message ?? `Ошибка ${res.status}`;
}

async function refreshSessionOnce(): Promise<SessionResponse | null> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const session = (await res.json()) as SessionResponse;
        window.dispatchEvent(new CustomEvent('botme:session-refreshed'));
        return session;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function refreshAuthSession(): Promise<SessionResponse> {
  const session = await refreshSessionOnce();
  if (!session) throw new ApiError('Сессия истекла', 401);
  return session;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  retryOn401 = true,
): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401 && retryOn401 && path !== '/auth/refresh' && path !== '/auth/login') {
    const refreshed = await refreshSessionOnce();
    if (refreshed) {
      return request<T>(path, init, false);
    }
  }

  if (!res.ok) {
    throw new ApiError(await parseError(res), res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string; checks: Record<string, string> }>('/health'),

  register: (body: {
    email: string;
    password: string;
    name: string;
    workspaceName: string;
  }) => request<SessionResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<SessionResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  me: () => request<AuthSession>('/auth/me'),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  refresh: () => refreshAuthSession(),

  switchWorkspace: (workspaceId: string) =>
    request<SessionResponse>('/auth/switch-workspace', {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    }),

  workspaceSummary: () =>
    request<{
      workspace: { id: string; slug: string; name: string };
      role: string;
      stats: {
        memberCount: number;
        agentsCount: number;
        assistantsCount: number;
        conversationsCount: number;
        leadsCount: number;
      };
    }>('/workspaces/current/summary'),

  integrations: {
    list: () => request<IntegrationDto[]>('/integrations'),
    create: (body: import('@botme/shared').CreateIntegrationInput) =>
      request<IntegrationDto>('/integrations', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: { name?: string; isDefault?: boolean; apiKey?: string }) =>
      request<IntegrationDto>(`/integrations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) =>
      request<{ ok: boolean }>(`/integrations/${id}`, { method: 'DELETE' }),
    validate: (id: string) =>
      request<ValidateIntegrationResult>(`/integrations/${id}/validate`, {
        method: 'POST',
        body: '{}',
      }),
    syncModels: (id: string) =>
      request<{ queued: true; jobId: string }>(`/integrations/${id}/sync-models`, {
        method: 'POST',
        body: '{}',
      }),
    models: (id: string) => request<ModelCacheDto[]>(`/integrations/${id}/models`),
  },

  agents: {
    list: () => request<AgentDto[]>('/agents'),
    get: (id: string) => request<AgentDetailDto>(`/agents/${id}`),
    create: (body: import('@botme/shared').CreateAgentInput) =>
      request<AgentDetailDto>('/agents', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: import('@botme/shared').UpdateAgentInput) =>
      request<AgentDetailDto>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    runtimeDiagnostics: (id: string) =>
      request<import('@botme/shared').AgentRuntimeDiagnosticsDto>(`/agents/${id}/runtime-diagnostics`),
    remove: (id: string) => request<{ ok: boolean }>(`/agents/${id}`, { method: 'DELETE' }),
    createPrompt: (id: string, body: { content: string; activate?: boolean }) =>
      request<AgentDetailDto>(`/agents/${id}/prompts`, { method: 'POST', body: JSON.stringify(body) }),
    activatePrompt: (id: string, version: number) =>
      request<AgentDetailDto>(`/agents/${id}/prompts/${version}/activate`, {
        method: 'POST',
        body: '{}',
      }),
  },

  playground: {
    getSession: (agentId: string) =>
      request<PlaygroundSessionDto | null>(`/playground/sessions/${agentId}`),
    clearSession: (sessionId: string) =>
      request<{ ok: boolean }>(`/playground/sessions/${sessionId}`, { method: 'DELETE' }),
  },

  assistants: {
    list: () => request<import('@botme/shared').AssistantDto[]>('/assistants'),
    get: (id: string) => request<import('@botme/shared').AssistantDetailDto>(`/assistants/${id}`),
    create: (body: import('@botme/shared').CreateAssistantInput) =>
      request<import('@botme/shared').AssistantDetailDto>('/assistants', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: import('@botme/shared').UpdateAssistantInput) =>
      request<import('@botme/shared').AssistantDetailDto>(`/assistants/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    remove: (id: string) => request<{ ok: boolean }>(`/assistants/${id}`, { method: 'DELETE' }),
    bindAgent: (id: string, agentId: string) =>
      request<import('@botme/shared').AssistantDetailDto>(`/assistants/${id}/agent`, {
        method: 'POST',
        body: JSON.stringify({ agentId }),
      }),
    bindKbs: (id: string, knowledgeBaseIds: string[]) =>
      request<import('@botme/shared').AssistantDetailDto>(`/assistants/${id}/kbs`, {
        method: 'POST',
        body: JSON.stringify({ knowledgeBaseIds }),
      }),
    bindTools: (id: string, toolIds: string[]) =>
      request<import('@botme/shared').AssistantDetailDto>(`/assistants/${id}/tools`, {
        method: 'POST',
        body: JSON.stringify({ toolIds }),
      }),
    runtime: (id: string) =>
      request<import('@botme/shared').AssistantRuntimeSnapshotDto>(`/assistants/${id}/runtime`),
    testChatSession: (id: string) =>
      request<import('@botme/shared').AssistantChatSessionDto>(`/assistants/${id}/test-chat/session`),
    clearTestChat: (id: string) =>
      request<{ ok: true }>(`/assistants/${id}/test-chat/session`, { method: 'DELETE' }),
  },

  knowledgeBases: {
    list: () => request<import('@botme/shared').KnowledgeBaseDto[]>('/knowledge-bases'),
    get: (id: string) => request<import('@botme/shared').KnowledgeBaseDto>(`/knowledge-bases/${id}`),
    create: (body: import('@botme/shared').CreateKnowledgeBaseInput) =>
      request<import('@botme/shared').KnowledgeBaseDto>('/knowledge-bases', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: import('@botme/shared').UpdateKnowledgeBaseInput) =>
      request<import('@botme/shared').KnowledgeBaseDto>(`/knowledge-bases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    listDocuments: (id: string) =>
      request<import('@botme/shared').KbDocumentDto[]>(`/knowledge-bases/${id}/documents`),
    getDocument: (id: string, docId: string) =>
      request<import('@botme/shared').KbDocumentDto & { rawContent?: string | null }>(
        `/knowledge-bases/${id}/documents/${docId}`,
      ),
    uploadUrl: (id: string, body: import('@botme/shared').UploadDocumentInput) =>
      request<import('@botme/shared').UploadUrlDto>(`/knowledge-bases/${id}/documents/upload-url`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    uploadFile: async (id: string, file: File, fileHash: string, mimeType: string) => {
      const form = new FormData();
      form.append('file', file);
      form.append('fileHash', fileHash);
      form.append('filename', file.name);
      form.append('mimeType', mimeType);
      form.append('sizeBytes', String(file.size));
      return request<import('@botme/shared').KbDocumentDto>(
        `/knowledge-bases/${id}/documents/upload`,
        { method: 'POST', body: form },
      );
    },
    ingestionStatus: (id: string) =>
      request<{
        knowledgeBaseId: string;
        documentCount: number;
        documentsByStatus: Record<string, number>;
        chunkCount: number;
        tokenCount: number;
        pendingEmbeddings: number;
        embeddingModelId: string | null;
        embeddingIntegrationId: string | null;
      }>(`/knowledge-bases/${id}/ingestion-status`),
    diagnostics: (id: string) =>
      request<{
        ingestion: {
          knowledgeBaseId: string;
          documentCount: number;
          documentsByStatus: Record<string, number>;
          chunkCount: number;
          tokenCount: number;
          pendingEmbeddings: number;
          embeddingModelId: string | null;
          embeddingIntegrationId: string | null;
        };
        integrity: {
          knowledgeBaseId: string;
          checkedAt: string;
          healthy: boolean;
          issues: Array<{ code: string; severity: string; count: number; message: string }>;
          stats: Record<string, number | boolean>;
        };
      }>(`/knowledge-bases/${id}/diagnostics`),
    heal: (id: string) =>
      request<{ before: unknown; after: unknown; actions: string[] }>(
        `/knowledge-bases/${id}/heal`,
        { method: 'POST' },
      ),
    createText: (id: string, body: import('@botme/shared').CreateTextDocumentInput) =>
      request<import('@botme/shared').KbDocumentDto>(`/knowledge-bases/${id}/documents/text`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateText: (id: string, docId: string, body: import('@botme/shared').UpdateTextDocumentInput) =>
      request<import('@botme/shared').KbDocumentDto>(
        `/knowledge-bases/${id}/documents/${docId}/text`,
        { method: 'PATCH', body: JSON.stringify(body) },
      ),
    previewChunks: (
      id: string,
      body: { content: string; mimeType: 'text/plain' | 'text/markdown' },
    ) =>
      request<import('@botme/shared').PreviewChunksResultDto>(
        `/knowledge-bases/${id}/documents/text/preview-chunks`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
    createUrl: (id: string, body: import('@botme/shared').CreateUrlDocumentInput) =>
      request<import('@botme/shared').KbDocumentDto>(`/knowledge-bases/${id}/documents/url`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    confirm: (id: string, docId: string) =>
      request<{ ok: boolean }>(`/knowledge-bases/${id}/documents/${docId}/confirm`, { method: 'POST' }),
    rollbackUpload: (id: string, docId: string) =>
      request<{ ok: boolean }>(`/knowledge-bases/${id}/documents/${docId}/rollback-upload`, {
        method: 'POST',
      }),
    retry: (id: string, docId: string) =>
      request<{ ok: boolean }>(`/knowledge-bases/${id}/documents/${docId}/retry`, { method: 'POST' }),
    listChunks: (id: string, docId: string, params?: { page?: number; search?: string }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.search) q.set('search', params.search);
      const qs = q.toString();
      return request<import('@botme/shared').KbChunksPageDto>(
        `/knowledge-bases/${id}/documents/${docId}/chunks${qs ? `?${qs}` : ''}`,
      );
    },
    retrieveTest: (id: string, body: import('@botme/shared').RetrieveTestInput) =>
      request<import('@botme/shared').RetrieveTestResultDto>(`/knowledge-bases/${id}/retrieve-test`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    removeDocument: (id: string, docId: string) =>
      request<{ ok: boolean }>(`/knowledge-bases/${id}/documents/${docId}`, { method: 'DELETE' }),
    remove: (id: string) =>
      request<{ ok: boolean }>(`/knowledge-bases/${id}`, { method: 'DELETE' }),
  },

  tools: {
    list: () => request<import('@botme/shared').ToolDto[]>('/tools'),
    get: (id: string) => request<import('@botme/shared').ToolDetailDto>(`/tools/${id}`),
    update: (id: string, body: Record<string, unknown>) =>
      request<import('@botme/shared').ToolDto>(`/tools/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    test: (id: string, body: { input: Record<string, unknown>; assistantId?: string; conversationId?: string }) =>
      request<import('@botme/shared').TestToolResultDto>(`/tools/${id}/test`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  widgets: {
    list: () => request<import('@botme/shared').WidgetDto[]>('/widgets'),
    get: (id: string) => request<import('@botme/shared').WidgetDetailDto>(`/widgets/${id}`),
    create: (body: import('@botme/shared').CreateWidgetInput) =>
      request<import('@botme/shared').WidgetDetailDto>('/widgets', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: import('@botme/shared').UpdateWidgetInput) =>
      request<import('@botme/shared').WidgetDetailDto>(`/widgets/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    updateDomains: (id: string, domains: string[]) =>
      request<import('@botme/shared').WidgetDetailDto>(`/widgets/${id}/domains`, {
        method: 'PUT',
        body: JSON.stringify({ domains }),
      }),
    remove: (id: string) => request<{ ok: boolean }>(`/widgets/${id}`, { method: 'DELETE' }),
    previewSession: (id: string) =>
      request<import('@botme/shared').WidgetPreviewSessionDto>(`/widgets/${id}/preview-session`),
    connectionCenter: (id: string) =>
      request<import('@botme/shared').WidgetConnectionCenterDto>(`/widgets/${id}/connection-center`),
    health: (id: string) =>
      request<import('@botme/shared').WidgetConnectionHealthDto>(`/widgets/${id}/health`),
    listOperatorTokens: (id: string) =>
      request<import('@botme/shared').OperatorRuntimeTokenDto[]>(`/widgets/${id}/operator-tokens`),
    createOperatorToken: (id: string, body: import('@botme/shared').CreateOperatorRuntimeTokenInput) =>
      request<import('@botme/shared').OperatorRuntimeTokenDto>(`/widgets/${id}/operator-tokens`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    revokeOperatorToken: (id: string, tokenId: string) =>
      request<{ ok: boolean }>(`/widgets/${id}/operator-tokens/${tokenId}`, { method: 'DELETE' }),
  },

  members: {
    list: () => request<import('@botme/shared').WorkspaceMemberDto[]>('/workspaces/current/members'),
    listInvites: () =>
      request<import('@botme/shared').WorkspaceInviteDto[]>('/workspaces/current/members/invites'),
    invite: (body: import('@botme/shared').InviteMemberInput) =>
      request<import('@botme/shared').InviteMemberResultDto>('/workspaces/current/members/invite', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateRole: (memberId: string, body: import('@botme/shared').UpdateMemberRoleInput) =>
      request<import('@botme/shared').WorkspaceMemberDto>(`/workspaces/current/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    remove: (memberId: string) =>
      request<{ ok: boolean }>(`/workspaces/current/members/${memberId}`, { method: 'DELETE' }),
    revokeInvite: (inviteId: string) =>
      request<{ ok: boolean }>(`/workspaces/current/members/invites/${inviteId}`, { method: 'DELETE' }),
  },

  leads: {
    list: (params?: Record<string, string>) => {
      const q = new URLSearchParams(params ?? {});
      const qs = q.toString();
      return request<import('@botme/shared').LeadDto[]>(`/leads${qs ? `?${qs}` : ''}`);
    },
    update: (id: string, body: { status?: string; name?: string; email?: string; phone?: string; notes?: string }) =>
      request<import('@botme/shared').LeadDto>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
};
