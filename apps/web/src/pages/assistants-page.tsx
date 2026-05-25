import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, ChevronRight, Loader2, Plus, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AgentDto, AssistantDto } from '@botme/shared';
import { hasMinRole } from '@botme/shared';
import { Badge, Button, Card, Input } from '@botme/ui';
import { api, ApiError } from '@/lib/api';
import { ru } from '@/i18n/ru';
import { useAuthStore } from '@/stores/auth';

const STEPS = ['Основное', 'Агент', 'Базы знаний', 'Инструменты', 'Runtime', 'Обзор'] as const;

export function AssistantsPage() {
  const role = useAuthStore((s) => s.session?.workspace.role);
  const canMutate = role ? hasMinRole(role, 'MEMBER') : false;
  const queryClient = useQueryClient();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    welcomeMessage: 'Здравствуйте! Чем могу помочь?',
    placeholder: 'Напишите сообщение…',
    agentId: '',
    kbIds: [] as string[],
    toolIds: [] as string[],
    isActive: false,
    runtime: {
      maxContextMessages: 20,
      memoryEnabled: true,
      streamingEnabled: true,
      fallbackMessage: 'Извините, сервис временно недоступен.',
    },
  });

  const assistantsQuery = useQuery({ queryKey: ['assistants'], queryFn: () => api.assistants.list() });
  const agentsQuery = useQuery({ queryKey: ['agents'], queryFn: () => api.agents.list() });
  const kbsQuery = useQuery({ queryKey: ['kbs'], queryFn: () => api.knowledgeBases.list(), enabled: wizardOpen });
  const toolsQuery = useQuery({ queryKey: ['tools'], queryFn: () => api.tools.list(), enabled: wizardOpen });

  const createMutation = useMutation({
    mutationFn: () =>
      api.assistants.create({
        name: form.name,
        description: form.description,
        agentId: form.agentId,
        welcomeMessage: form.welcomeMessage,
        placeholder: form.placeholder,
        isActive: form.isActive,
        runtimeSettings: form.runtime,
      }),
    onSuccess: async (data) => {
      setDraftId(data.id);
      await queryClient.invalidateQueries({ queryKey: ['assistants'] });
      setStep(2);
      setError(null);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : ru.common.error),
  });

  const bindMutation = useMutation({
    mutationFn: async () => {
      if (!draftId) return;
      await api.assistants.bindKbs(draftId, form.kbIds);
      await api.assistants.bindTools(draftId, form.toolIds);
      if (form.isActive) {
        await api.assistants.update(draftId, { isActive: true, status: 'ACTIVE' });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assistants'] });
      setWizardOpen(false);
      setStep(0);
      setDraftId(null);
    },
  });

  const toggleKb = (id: string) => {
    setForm((f) => ({
      ...f,
      kbIds: f.kbIds.includes(id) ? f.kbIds.filter((x) => x !== id) : [...f.kbIds, id],
    }));
  };

  const toggleTool = (id: string) => {
    setForm((f) => ({
      ...f,
      toolIds: f.toolIds.includes(id) ? f.toolIds.filter((x) => x !== id) : [...f.toolIds, id],
    }));
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">{ru.assistants.title}</h1>
          <p className="mt-1 text-sm text-zinc-400">{ru.assistants.subtitle}</p>
        </div>
        {canMutate && (
          <Button onClick={() => setWizardOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            {ru.assistants.add}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        {assistantsQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#39ff14]" />
          </div>
        ) : (assistantsQuery.data ?? []).length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-zinc-500">{ru.assistants.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/5 text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">{ru.assistants.name}</th>
                  <th className="px-4 py-3 text-left">{ru.assistants.agent}</th>
                  <th className="px-4 py-3 text-left">KB / Tools</th>
                  <th className="px-4 py-3 text-left">Статус</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {(assistantsQuery.data ?? []).map((a: AssistantDto) => (
                  <tr key={a.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-white">
                        <Sparkles className="h-4 w-4 text-[#39ff14]" />
                        {a.name}
                      </div>
                      <p className="text-xs text-zinc-500">{a.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{a.agentName}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      {a.knowledgeBaseCount} / {a.toolCount}
                    </td>
                    <td className="px-4 py-3">
                      {a.isActive ? (
                        <Badge variant="success">{ru.assistants.active}</Badge>
                      ) : (
                        <Badge variant="muted">Черновик</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link to={`/admin/assistants/${a.id}/chat`}>
                          <Button variant="ghost" className="text-xs">
                            {ru.assistants.testChat}
                          </Button>
                        </Link>
                        <Link to={`/admin/assistants/${a.id}`}>
                          <Button variant="secondary" className="text-xs">
                            Orchestration
                          </Button>
                        </Link>
                        <Link to={`/admin/assistants/${a.id}/runtime`}>
                          <Button variant="secondary" className="text-xs">
                            {ru.assistants.runtime}
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#0a0f0a]/95 p-6 shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">{ru.assistants.wizard}</h2>
                <p className="text-xs text-zinc-500">
                  Шаг {step + 1} / {STEPS.length}: {STEPS[step]}
                </p>
              </div>
              <button type="button" onClick={() => setWizardOpen(false)}>
                <X className="h-5 w-5 text-zinc-500" />
              </button>
            </div>

            <div className="mb-6 flex gap-1">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-[#39ff14]' : 'bg-white/10'}`}
                />
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
                {step === 0 && (
                  <div className="space-y-4">
                    <Input label={ru.assistants.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    <Input label={ru.assistants.description} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    <Input label="Welcome" value={form.welcomeMessage} onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })} />
                  </div>
                )}
                {step === 1 && (
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {(agentsQuery.data ?? []).filter((a: AgentDto) => a.status === 'ACTIVE').map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => setForm({ ...form, agentId: agent.id })}
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          form.agentId === agent.id
                            ? 'border-[#39ff14]/50 bg-[#39ff14]/10'
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-white">
                          <Bot className="h-4 w-4" />
                          {agent.name}
                        </div>
                        <p className="mt-1 font-mono text-xs text-zinc-500">{agent.modelId}</p>
                      </button>
                    ))}
                  </div>
                )}
                {step === 2 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {(kbsQuery.data ?? []).map((kb) => (
                      <label key={kb.id} className="flex items-center gap-2 rounded-lg border border-white/10 p-3">
                        <input type="checkbox" checked={form.kbIds.includes(kb.id)} onChange={() => toggleKb(kb.id)} />
                        <span className="text-sm text-white">{kb.name}</span>
                      </label>
                    ))}
                    {(kbsQuery.data ?? []).length === 0 && (
                      <p className="text-sm text-zinc-500">{ru.assistants.noKbs}</p>
                    )}
                  </div>
                )}
                {step === 3 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {(toolsQuery.data ?? []).map((tool) => (
                      <label key={tool.id} className="flex items-center gap-2 rounded-lg border border-white/10 p-3">
                        <input type="checkbox" checked={form.toolIds.includes(tool.id)} onChange={() => toggleTool(tool.id)} />
                        <span className="text-sm text-white">{tool.name}</span>
                      </label>
                    ))}
                    {(toolsQuery.data ?? []).length === 0 && (
                      <p className="text-sm text-zinc-500">{ru.assistants.noTools}</p>
                    )}
                  </div>
                )}
                {step === 4 && (
                  <div className="space-y-4">
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      <input type="checkbox" checked={form.runtime.streamingEnabled} onChange={(e) => setForm({ ...form, runtime: { ...form.runtime, streamingEnabled: e.target.checked } })} />
                      Streaming
                    </label>
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      <input type="checkbox" checked={form.runtime.memoryEnabled} onChange={(e) => setForm({ ...form, runtime: { ...form.runtime, memoryEnabled: e.target.checked } })} />
                      Memory
                    </label>
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                      {ru.assistants.activate}
                    </label>
                  </div>
                )}
                {step === 5 && (
                  <div className="space-y-2 text-sm text-zinc-300">
                    <p><strong className="text-white">{form.name}</strong></p>
                    <p>Agent: {agentsQuery.data?.find((a) => a.id === form.agentId)?.name}</p>
                    <p>KB: {form.kbIds.length} · Tools: {form.toolIds.length}</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

            <div className="mt-6 flex justify-between">
              <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                Назад
              </Button>
              {step < 1 && (
                <Button disabled={!form.name} onClick={() => setStep(1)}>
                  Далее <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
              {step === 1 && (
                <Button
                  loading={createMutation.isPending}
                  disabled={!form.agentId}
                  onClick={() => createMutation.mutate()}
                >
                  Создать и продолжить
                </Button>
              )}
              {step > 1 && step < 5 && (
                <Button onClick={() => setStep((s) => s + 1)}>
                  Далее <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
              {step === 5 && (
                <Button loading={bindMutation.isPending} onClick={() => bindMutation.mutate()}>
                  {ru.assistants.finish}
                </Button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
