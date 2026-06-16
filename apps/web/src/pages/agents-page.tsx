import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bot, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AgentDetailDto, AgentDto, IntegrationDto, ModelCacheDto } from '@botme/shared';
import { Badge, Button, Card, Input, Select, SelectOption } from '@botme/ui';
import {
  AgentFallbackChainEditor,
  type FallbackFormRow,
} from '@/components/agents/agent-fallback-chain';
import { api, ApiError } from '@/lib/api';
import {
  defaultPrimaryModelId,
  modelsForIntegrationPicker,
} from '@/lib/integration-model-chain';
import { ru } from '@/i18n/ru';
import { useAuthStore } from '@/stores/auth';

function statusBadge(status: string) {
  return status === 'ACTIVE' ? (
    <Badge variant="success">{ru.agents.active}</Badge>
  ) : (
    <Badge variant="muted">Архив</Badge>
  );
}

type AgentForm = {
  name: string;
  description: string;
  integrationId: string;
  modelId: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  fallbacks: FallbackFormRow[];
};

const emptyForm = (): AgentForm => ({
  name: '',
  description: '',
  integrationId: '',
  modelId: '',
  systemPrompt: 'You are a helpful assistant.',
  temperature: 0.7,
  maxTokens: 4096,
  fallbacks: [],
});

export function AgentsPage() {
  const role = useAuthStore((s) => s.session?.workspace.role);
  const canMutate = role === 'ADMIN' || role === 'OWNER';
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editAgentId, setEditAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AgentForm>(emptyForm());

  const agentsQuery = useQuery({ queryKey: ['agents'], queryFn: () => api.agents.list() });
  const integrationsQuery = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.integrations.list(),
  });

  const modelsQuery = useQuery({
    queryKey: ['integration-models', form.integrationId],
    queryFn: () => api.integrations.models(form.integrationId),
    enabled: !!form.integrationId,
  });

  const activeIntegrations = useMemo(
    () => (integrationsQuery.data ?? []).filter((i) => i.status === 'ACTIVE'),
    [integrationsQuery.data],
  );

  const selectedIntegration = activeIntegrations.find((i) => i.id === form.integrationId);

  const pickerModels = useMemo(
    () => modelsForIntegrationPicker(selectedIntegration, modelsQuery.data ?? []),
    [selectedIntegration, modelsQuery.data],
  );

  const openCreate = () => {
    setEditAgentId(null);
    setForm(emptyForm());
    setError(null);
    setModalOpen(true);
  };

  const openEdit = async (agent: AgentDto) => {
    setError(null);
    setEditAgentId(agent.id);
    const detail = await api.agents.get(agent.id);
    setForm({
      name: detail.name,
      description: detail.description,
      integrationId: detail.integrationId,
      modelId: detail.modelId,
      systemPrompt: detail.systemPrompt,
      temperature: detail.temperature,
      maxTokens: detail.maxTokens,
      fallbacks: detail.fallbacks.map((f) => ({
        integrationId: f.integrationId,
        modelId: f.modelId,
        enabled: f.enabled,
        maxRetries: f.maxRetries,
        timeoutMs: f.timeoutMs,
      })),
    });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        description: form.description || undefined,
        integrationId: form.integrationId,
        modelId: form.modelId,
        systemPrompt: form.systemPrompt,
        temperature: form.temperature,
        maxTokens: form.maxTokens,
        fallbacks: form.fallbacks.map(({ integrationId, modelId, enabled, maxRetries, timeoutMs }) => ({
          integrationId,
          modelId,
          enabled,
          maxRetries,
          timeoutMs,
        })),
      };
      if (editAgentId) {
        const { systemPrompt: _, ...updateBody } = body;
        return api.agents.update(editAgentId, updateBody);
      }
      return api.agents.create(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      setModalOpen(false);
      setError(null);
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : ru.common.error);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.agents.update(id, { status: 'ARCHIVED' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">{ru.agents.title}</h1>
          <p className="mt-1 text-sm text-zinc-400">{ru.agents.subtitle}</p>
        </div>
        {canMutate && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            {ru.agents.add}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-white/5 px-4 py-3 text-sm font-medium text-zinc-300">
          {ru.agents.tableTitle}
        </div>
        {agentsQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#39ff14]" />
          </div>
        ) : (agentsQuery.data ?? []).length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-zinc-500">{ru.agents.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/5 text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{ru.agents.name}</th>
                  <th className="px-4 py-3 font-medium">{ru.agents.model}</th>
                  <th className="px-4 py-3 font-medium">Fallbacks</th>
                  <th className="px-4 py-3 font-medium">{ru.agents.integration}</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  {canMutate && <th className="px-4 py-3 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {(agentsQuery.data ?? []).map((agent: AgentDto) => (
                  <tr key={agent.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-[#39ff14]" />
                        <span className="font-medium text-white">{agent.name}</span>
                      </div>
                      {agent.description && (
                        <p className="mt-0.5 text-xs text-zinc-500">{agent.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-300">{agent.modelId}</td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {agent.fallbacks?.length ? (
                        <span title={agent.fallbacks.map((f) => f.modelId).join(' → ')}>
                          +{agent.fallbacks.length} models
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{agent.integrationName}</td>
                    <td className="px-4 py-3">{statusBadge(agent.status)}</td>
                    {canMutate && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" onClick={() => void openEdit(agent)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Link to={`/admin/agents/${agent.id}`}>
                            <Button variant="secondary" className="text-xs">
                              {ru.agents.editor.open}
                            </Button>
                          </Link>
                          <Link to={`/admin/agents/${agent.id}/playground`}>
                            <Button variant="secondary" className="text-xs">
                              {ru.agents.playground}
                            </Button>
                          </Link>
                          {agent.status === 'ACTIVE' && (
                            <Button
                              variant="ghost"
                              className="text-zinc-400 hover:text-red-400"
                              onClick={() => archiveMutation.mutate(agent.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0f0a]/95 p-6 shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {editAgentId ? 'Edit agent' : ru.agents.add}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} className="text-zinc-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <Input
                label={ru.agents.name}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <Input
                label={ru.agents.description}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
              <label className="block text-sm text-zinc-400">
                {ru.agents.integration}
                <Select
                  className="mt-1"
                  value={form.integrationId}
                  onChange={(e) => {
                    const integrationId = e.target.value;
                    const integration = activeIntegrations.find((i) => i.id === integrationId);
                    setForm((f) => ({
                      ...f,
                      integrationId,
                      modelId: defaultPrimaryModelId(integration),
                      fallbacks: [],
                    }));
                  }}
                >
                  <SelectOption value="">—</SelectOption>
                  {activeIntegrations.map((i: IntegrationDto) => (
                    <SelectOption key={i.id} value={i.id}>
                      {i.name} ({i.provider})
                    </SelectOption>
                  ))}
                </Select>
              </label>
              <label className="block text-sm text-zinc-400">
                Primary model
                {selectedIntegration && selectedIntegration.modelChain.length > 0 && (
                  <span className="ml-2 text-xs text-zinc-500">
                    ({selectedIntegration.modelChain.length} из цепочки интеграции)
                  </span>
                )}
                <Select
                  className="mt-1"
                  value={form.modelId}
                  onChange={(e) => setForm((f) => ({ ...f, modelId: e.target.value }))}
                  disabled={!form.integrationId}
                >
                  <SelectOption value="">—</SelectOption>
                  {pickerModels.map((m: ModelCacheDto) => (
                    <SelectOption key={m.id} value={m.externalId}>
                      {m.displayName}
                      {m.isFree ? ' (free)' : ''}
                      {m.supportsTools ? ' [tools]' : ''}
                    </SelectOption>
                  ))}
                </Select>
              </label>
              {form.integrationId && form.modelId && (
                <AgentFallbackChainEditor
                  primaryIntegrationId={form.integrationId}
                  primaryModelId={form.modelId}
                  fallbacks={form.fallbacks}
                  onChange={(fallbacks) => setForm((f) => ({ ...f, fallbacks }))}
                  integrations={activeIntegrations}
                />
              )}
              {!editAgentId && (
                <label className="block text-sm text-zinc-400">
                  {ru.agents.systemPrompt}
                  <textarea
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white"
                    rows={4}
                    value={form.systemPrompt}
                    onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                  />
                </label>
              )}
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button
                className="w-full"
                loading={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                disabled={!form.name || !form.integrationId || !form.modelId}
              >
                {editAgentId ? 'Save' : ru.agents.create}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
