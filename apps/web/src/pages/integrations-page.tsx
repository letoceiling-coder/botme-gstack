import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { IntegrationDto, ModelCacheDto } from '@botme/shared';
import { Badge, Button, Card, Input, Select, SelectOption } from '@botme/ui';
import { api, ApiError } from '@/lib/api';
import { ru } from '@/i18n/ru';
import { useAuthStore } from '@/stores/auth';

const PROVIDERS = [
  {
    id: 'OPENAI' as const,
    title: 'OpenAI',
    description: 'GPT-4o, o1, embeddings',
    accent: 'from-emerald-500/20 to-transparent',
    badge: null as string | null,
  },
  {
    id: 'OPENROUTER' as const,
    title: 'OpenRouter',
    description: '300+ моделей, бесплатные tier',
    accent: 'from-violet-500/20 to-transparent',
    badge: null,
  },
  {
    id: 'OLLAMA_NEEKLO' as const,
    title: 'Ollama Neeklo',
    description: 'Локальные модели через Neeklo — без API-ключа в UI',
    accent: 'from-cyan-500/20 to-transparent',
    badge: 'LOCAL',
  },
];

function statusBadge(status: string) {
  switch (status) {
    case 'ACTIVE':
      return <Badge variant="success">Активна</Badge>;
    case 'INVALID':
      return <Badge variant="warning">Неверный ключ</Badge>;
    case 'DISABLED':
      return <Badge variant="muted">Отключена</Badge>;
    default:
      return <Badge variant="muted">Проверка…</Badge>;
  }
}

export function IntegrationsPage() {
  const role = useAuthStore((s) => s.session?.workspace.role);
  const canMutate = role === 'ADMIN' || role === 'OWNER';
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<{
    provider: 'OPENAI' | 'OPENROUTER' | 'OLLAMA_NEEKLO';
    name: string;
    apiKey: string;
    isDefault: boolean;
  }>({
    provider: 'OPENAI',
    name: '',
    apiKey: '',
    isDefault: false,
  });
  const [error, setError] = useState<string | null>(null);

  const integrationsQuery = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.integrations.list(),
  });

  const modelsQuery = useQuery({
    queryKey: ['integration-models', selectedId],
    queryFn: () => api.integrations.models(selectedId!),
    enabled: !!selectedId,
  });

  const createMutation = useMutation({
    mutationFn: () => api.integrations.create(form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setModalOpen(false);
      setForm({ provider: 'OPENAI', name: '', apiKey: '', isDefault: false });
      setError(null);
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : ru.common.error);
    },
  });

  const validateMutation = useMutation({
    mutationFn: (id: string) => api.integrations.validate(id),
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({ queryKey: ['integrations'] });
      await queryClient.invalidateQueries({ queryKey: ['integration-models', id] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => api.integrations.syncModels(id),
    onSuccess: () => {
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['integrations'] });
        if (selectedId) {
          void queryClient.invalidateQueries({ queryKey: ['integration-models', selectedId] });
        }
      }, 2000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.integrations.remove(id),
    onSuccess: async () => {
      if (selectedId) setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const filteredModels = useMemo(() => {
    const models = modelsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.externalId.toLowerCase().includes(q),
    );
  }, [modelsQuery.data, search]);

  const integrations = integrationsQuery.data ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {ru.integrations.title}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">{ru.integrations.subtitle}</p>
        </div>
        {canMutate && (
          <Button onClick={() => setModalOpen(true)} className="gap-2">
            <Plus size={16} />
            {ru.integrations.add}
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PROVIDERS.map((p) => (
          <motion.div key={p.id} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
            <Card className={`bg-gradient-to-br ${p.accent} p-5`}>
              <div className="flex items-center gap-2">
                <p className="text-lg font-medium text-white">{p.title}</p>
                {p.badge ? (
                  <Badge variant="success" className="text-[10px] uppercase tracking-wide">
                    {p.badge}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-zinc-400">{p.description}</p>
              <p className="mt-3 text-xs text-zinc-500">
                {integrations.filter((i) => i.provider === p.id).length} подключено
              </p>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-white/8 px-4 py-3 sm:px-6">
          <h2 className="text-sm font-medium text-zinc-300">{ru.integrations.tableTitle}</h2>
        </div>
        {integrationsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12 text-zinc-500">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : integrations.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">{ru.integrations.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-white/[0.02] text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3 sm:px-6">Название</th>
                  <th className="px-4 py-3">Провайдер</th>
                  <th className="px-4 py-3">Ключ</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Модели</th>
                  {canMutate && <th className="px-4 py-3 sm:px-6">Действия</th>}
                </tr>
              </thead>
              <tbody>
                {integrations.map((row: IntegrationDto) => (
                  <tr
                    key={row.id}
                    className={`border-t border-white/5 transition-colors hover:bg-white/[0.02] ${
                      selectedId === row.id ? 'bg-[#39ff14]/5' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-white sm:px-6">
                      <button
                        type="button"
                        className="text-left hover:text-[#39ff14]"
                        onClick={() => setSelectedId(row.id)}
                      >
                        {row.name}
                        {row.isDefault && (
                          <Badge variant="default" className="ml-2">
                            default
                          </Badge>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{row.provider}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{row.maskedKey}</td>
                    <td className="px-4 py-3">{statusBadge(row.status)}</td>
                    <td className="px-4 py-3 text-zinc-300">{row.modelCount}</td>
                    {canMutate && (
                      <td className="px-4 py-3 sm:px-6">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            className="px-2 py-2"
                            disabled={validateMutation.isPending}
                            onClick={() => validateMutation.mutate(row.id)}
                          >
                            <ShieldCheck size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            className="px-2 py-2"
                            disabled={syncMutation.isPending}
                            onClick={() => syncMutation.mutate(row.id)}
                          >
                            <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
                          </Button>
                          <Button
                            variant="ghost"
                            className="px-2 py-2"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(row.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
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

      {selectedId && (
        <Card className="p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-medium text-white">{ru.integrations.modelsTitle}</h2>
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={ru.integrations.searchModels}
                className="pl-9"
              />
            </div>
          </div>

          {modelsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-zinc-500" size={20} />
            </div>
          ) : filteredModels.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">{ru.integrations.noModels}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredModels.map((m: ModelCacheDto) => (
                <ModelCard key={m.id} model={m} />
              ))}
            </div>
          )}
        </Card>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md rounded-xl border border-white/10 bg-[#111113] p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{ru.integrations.add}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-zinc-400">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">{ru.integrations.provider}</label>
                <Select
                  value={form.provider}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      provider: e.target.value as 'OPENAI' | 'OPENROUTER' | 'OLLAMA_NEEKLO',
                    }))
                  }
                >
                  <SelectOption value="OPENAI">OpenAI</SelectOption>
                  <SelectOption value="OPENROUTER">OpenRouter</SelectOption>
                  <SelectOption value="OLLAMA_NEEKLO">Ollama Neeklo (LOCAL)</SelectOption>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">{ru.integrations.name}</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={
                    form.provider === 'OLLAMA_NEEKLO' ? 'Ollama Neeklo' : 'Production OpenAI'
                  }
                />
              </div>
              {form.provider !== 'OLLAMA_NEEKLO' && (
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">{ru.integrations.apiKey}</label>
                  <Input
                    type="password"
                    value={form.apiKey}
                    onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                    placeholder="sk-..."
                    autoComplete="off"
                  />
                </div>
              )}
              {form.provider === 'OLLAMA_NEEKLO' && (
                <p className="text-xs text-zinc-500">
                  Токен управляется сервером. Ключ не вводится и не хранится в браузере.
                </p>
              )}
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                />
                {ru.integrations.defaultIntegration}
              </label>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button
                className="w-full"
                disabled={
                  createMutation.isPending ||
                  !form.name ||
                  (form.provider !== 'OLLAMA_NEEKLO' && !form.apiKey)
                }
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <>
                    <CheckCircle2 size={16} className="mr-2" />
                    {ru.integrations.connect}
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function ModelCard({ model }: { model: ModelCacheDto }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.03] p-4 transition hover:border-[#39ff14]/30">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-white">{model.displayName}</p>
        {model.isFree && <Badge variant="free">Бесплатно</Badge>}
      </div>
      <p className="mt-1 truncate font-mono text-xs text-zinc-500">{model.externalId}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
        <span>Контекст: {model.contextWindow > 0 ? model.contextWindow.toLocaleString('ru') : '—'}</span>
        {model.promptPrice && <span>In: ${model.promptPrice}</span>}
        {model.completionPrice && <span>Out: ${model.completionPrice}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {model.supportsTools && <Badge variant="muted">Tools</Badge>}
        {model.supportsVision && <Badge variant="muted">Vision</Badge>}
        {model.supportsReasoning && <Badge variant="muted">Reasoning</Badge>}
      </div>
    </div>
  );
}
