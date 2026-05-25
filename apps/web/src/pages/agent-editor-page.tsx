import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  Check,
  Copy,
  GitCompare,
  Layers,
  Loader2,
  Play,
  Save,
  Settings2,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AgentDetailDto, PromptVersionDto } from '@botme/shared';
import { Badge, Button, Card, Input } from '@botme/ui';
import { AgentDiagnosticsPanel } from '@/components/agents/agent-diagnostics-panel';
import {
  AgentFallbackChainEditor,
  type FallbackFormRow,
} from '@/components/agents/agent-fallback-chain';
import { AgentModelSelector } from '@/components/agents/agent-model-selector';
import { api, ApiError } from '@/lib/api';
import { ru } from '@/i18n/ru';
import { useAuthStore } from '@/stores/auth';

type SidebarSection = 'prompt' | 'runtime' | 'fallback' | 'diagnostics';

function estimateTokens(text: string): number {
  return Math.ceil(text.trim().length / 4);
}

function diffLines(a: string, b: string): { type: 'same' | 'removed' | 'added'; line: string }[] {
  const left = a.split('\n');
  const right = b.split('\n');
  const max = Math.max(left.length, right.length);
  const out: { type: 'same' | 'removed' | 'added'; line: string }[] = [];
  for (let i = 0; i < max; i++) {
    const l = left[i];
    const r = right[i];
    if (l === r && l !== undefined) out.push({ type: 'same', line: l });
    else {
      if (l !== undefined) out.push({ type: 'removed', line: l });
      if (r !== undefined) out.push({ type: 'added', line: r });
    }
  }
  return out;
}

const SIDEBAR: { id: SidebarSection; label: string; icon: typeof Settings2 }[] = [
  { id: 'prompt', label: 'Промпт', icon: Copy },
  { id: 'runtime', label: 'Runtime', icon: Settings2 },
  { id: 'fallback', label: 'Fallback chain', icon: Layers },
  { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
];

export function AgentEditorPage() {
  const { id = '' } = useParams();
  const role = useAuthStore((s) => s.session?.workspace.role);
  const canMutate = role === 'ADMIN' || role === 'OWNER';
  const queryClient = useQueryClient();

  const [section, setSection] = useState<SidebarSection>('runtime');
  const [draft, setDraft] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  const [runtimeForm, setRuntimeForm] = useState({
    integrationId: '',
    modelId: '',
    temperature: 0.7,
    topP: 1,
    maxTokens: 4096,
    streamingEnabled: true,
    toolsEnabled: false,
    fallbacks: [] as FallbackFormRow[],
  });

  const agentQuery = useQuery({
    queryKey: ['agent', id],
    queryFn: () => api.agents.get(id),
    enabled: !!id,
  });

  const integrationsQuery = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.integrations.list(),
  });

  const runtimeSnapQuery = useQuery({
    queryKey: ['agent-runtime-snap', id],
    queryFn: async () => {
      const assistants = await api.assistants.list();
      const linked = assistants.find((a) => a.agentId === id);
      if (!linked) return null;
      return api.assistants.runtime(linked.id);
    },
    enabled: !!id,
  });

  const agent = agentQuery.data;
  const versions = agent?.promptVersions ?? [];
  const activeIntegrations = useMemo(
    () => (integrationsQuery.data ?? []).filter((i) => i.status === 'ACTIVE'),
    [integrationsQuery.data],
  );

  useEffect(() => {
    if (!agent) return;
    setRuntimeForm({
      integrationId: agent.integrationId,
      modelId: agent.modelId,
      temperature: agent.temperature,
      topP: agent.topP,
      maxTokens: agent.maxTokens,
      streamingEnabled: agent.streamingEnabled ?? true,
      toolsEnabled: agent.toolsEnabled ?? false,
      fallbacks: agent.fallbacks.map((f) => ({
        integrationId: f.integrationId,
        modelId: f.modelId,
        enabled: f.enabled,
        maxRetries: f.maxRetries,
        timeoutMs: f.timeoutMs,
      })),
    });
  }, [agent?.id, agent?.updatedAt]);

  const activeVersion = useMemo(
    () => versions.find((v) => v.isActive) ?? versions[versions.length - 1],
    [versions],
  );

  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === selectedVersionId) ?? activeVersion,
    [versions, selectedVersionId, activeVersion],
  );

  const compareVersion = useMemo(
    () => versions.find((v) => v.id === compareVersionId) ?? null,
    [versions, compareVersionId],
  );

  useEffect(() => {
    if (!selectedVersion) return;
    setDraft(selectedVersion.content);
  }, [selectedVersion?.id, selectedVersion?.content]);

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['agent', id] });
    await queryClient.invalidateQueries({ queryKey: ['agents'] });
    await queryClient.invalidateQueries({ queryKey: ['agent-diagnostics', id] });
  }, [queryClient, id]);

  const saveMutation = useMutation({
    mutationFn: (activate: boolean) =>
      api.agents.createPrompt(id, { content: draft, activate }),
    onSuccess: async (updated) => {
      await invalidate();
      setError(null);
      setSavedHint(ru.agents.editor.saved);
      const newest = updated.promptVersions[updated.promptVersions.length - 1];
      if (newest) setSelectedVersionId(newest.id);
      setTimeout(() => setSavedHint(null), 2500);
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : ru.common.error);
    },
  });

  const activateMutation = useMutation({
    mutationFn: (version: number) => api.agents.activatePrompt(id, version),
    onSuccess: async (updated) => {
      await invalidate();
      setError(null);
      const active = updated.promptVersions.find((v) => v.isActive);
      if (active) setSelectedVersionId(active.id);
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : ru.common.error);
    },
  });

  const saveRuntimeMutation = useMutation({
    mutationFn: () =>
      api.agents.update(id, {
        integrationId: runtimeForm.integrationId,
        modelId: runtimeForm.modelId,
        temperature: runtimeForm.temperature,
        topP: runtimeForm.topP,
        maxTokens: runtimeForm.maxTokens,
        streamingEnabled: runtimeForm.streamingEnabled,
        toolsEnabled: runtimeForm.toolsEnabled,
        fallbacks: runtimeForm.fallbacks.map(({ integrationId, modelId, enabled, maxRetries, timeoutMs }) => ({
          integrationId,
          modelId,
          enabled,
          maxRetries,
          timeoutMs,
        })),
      }),
    onSuccess: async () => {
      await invalidate();
      setError(null);
      setSavedHint('Runtime сохранён');
      setTimeout(() => setSavedHint(null), 2500);
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : ru.common.error);
    },
  });

  const isDirty = selectedVersion ? draft !== selectedVersion.content : draft.length > 0;
  const tokenEstimate = estimateTokens(draft);

  if (agentQuery.isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#39ff14]" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="py-12 text-center text-zinc-500">
        {ru.common.error}
        <Link to="/admin/agents" className="mt-4 block text-[#39ff14]">
          {ru.agents.editor.back}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            to="/admin/agents"
            className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {ru.agents.editor.back}
          </Link>
          <h1 className="text-2xl font-semibold text-white">{agent.name}</h1>
          <p className="mt-1 text-sm text-zinc-400">Runtime control center</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/admin/agents/${id}/playground`}>
            <Button variant="secondary" className="gap-2">
              <Play className="h-4 w-4" />
              {ru.agents.playground}
            </Button>
          </Link>
          {canMutate && section === 'prompt' && (
            <>
              <Button
                variant="secondary"
                disabled={!isDirty || saveMutation.isPending}
                onClick={() => saveMutation.mutate(false)}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {ru.agents.editor.saveDraft}
              </Button>
              <Button
                disabled={!draft.trim() || saveMutation.isPending}
                onClick={() => saveMutation.mutate(true)}
                className="gap-2"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {ru.agents.editor.saveActivate}
              </Button>
            </>
          )}
          {canMutate && (section === 'runtime' || section === 'fallback') && (
            <Button
              className="gap-2"
              loading={saveRuntimeMutation.isPending}
              disabled={!runtimeForm.integrationId || !runtimeForm.modelId}
              onClick={() => saveRuntimeMutation.mutate()}
            >
              <Zap className="h-4 w-4" />
              Save runtime
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      {savedHint && (
        <div className="rounded-lg border border-[#39ff14]/30 bg-[#39ff14]/10 px-4 py-2 text-sm text-[#39ff14]">
          {savedHint}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="space-y-4">
          <Card className="p-3">
            <nav className="space-y-1">
              {SIDEBAR.map(({ id: sid, label, icon: Icon }) => (
                <button
                  key={sid}
                  type="button"
                  onClick={() => setSection(sid)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    section === sid
                      ? 'bg-[#39ff14]/10 text-white'
                      : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              ))}
            </nav>
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Active runtime
            </h2>
            <dl className="space-y-2 text-xs text-zinc-300">
              <div>
                <dt className="text-zinc-500">Model</dt>
                <dd className="font-mono">{agent.modelId}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Integration</dt>
                <dd>{agent.integrationName}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Prompt</dt>
                <dd>v{agent.activeVersion ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Fallbacks</dt>
                <dd>{agent.fallbacks.length || '—'}</dd>
              </div>
              {runtimeSnapQuery.data && (
                <div>
                  <dt className="text-zinc-500">Snapshot</dt>
                  <dd className="truncate font-mono">{runtimeSnapQuery.data.snapshotId.slice(0, 12)}…</dd>
                </div>
              )}
            </dl>
          </Card>

          {section === 'prompt' && (
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-medium text-zinc-300">{ru.agents.versions}</h2>
              <ul className="space-y-2">
                {versions.map((v: PromptVersionDto) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVersionId(v.id);
                        setCompareVersionId(null);
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        selectedVersion?.id === v.id
                          ? 'border-[#39ff14]/40 bg-[#39ff14]/10 text-white'
                          : 'border-white/5 bg-white/[0.02] text-zinc-300 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono">v{v.version}</span>
                        {v.isActive && <Badge variant="success">{ru.agents.active}</Badge>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {section === 'prompt' && (
            <>
              <Card className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <span>{ru.agents.systemPrompt}</span>
                    {selectedVersion && (
                      <span className="font-mono text-zinc-500">v{selectedVersion.version}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                    <span>
                      {ru.agents.editor.chars}: {draft.length}
                    </span>
                    <span>
                      {ru.agents.editor.tokens}: ~{tokenEstimate}
                    </span>
                  </div>
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  readOnly={!canMutate}
                  rows={18}
                  spellCheck={false}
                  className="w-full resize-y rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-sm leading-relaxed text-zinc-100 focus:border-[#39ff14]/40 focus:outline-none"
                  placeholder={ru.agents.systemPrompt}
                />
              </Card>
              {versions.length > 1 && compareVersion && selectedVersion && (
                <Card className="p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <GitCompare className="h-4 w-4 text-zinc-400" />
                    <span className="text-sm text-zinc-300">{ru.agents.editor.diffTitle}</span>
                    <select
                      className="rounded-lg border border-white/10 bg-[#1a1a1d] px-2 py-1 text-sm text-white"
                      value={compareVersionId ?? ''}
                      onChange={(e) => setCompareVersionId(e.target.value || null)}
                    >
                      <option value="">{ru.agents.editor.diffSelect}</option>
                      {versions
                        .filter((v) => v.id !== selectedVersion?.id)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            v{v.version}
                          </option>
                        ))}
                    </select>
                  </div>
                  <pre className="max-h-64 overflow-auto rounded-lg border border-white/5 bg-black/30 p-3 font-mono text-xs">
                    {diffLines(compareVersion.content, draft).map((row, i) => (
                      <div
                        key={`${i}-${row.type}`}
                        className={
                          row.type === 'removed'
                            ? 'bg-red-500/10 text-red-300'
                            : row.type === 'added'
                              ? 'bg-[#39ff14]/10 text-[#39ff14]'
                              : 'text-zinc-400'
                        }
                      >
                        {row.type === 'removed' ? '- ' : row.type === 'added' ? '+ ' : '  '}
                        {row.line}
                      </div>
                    ))}
                  </pre>
                </Card>
              )}
            </>
          )}

          {section === 'runtime' && (
            <Card className="p-4">
              <AgentModelSelector
                integrationId={runtimeForm.integrationId}
                modelId={runtimeForm.modelId}
                integrations={activeIntegrations}
                disabled={!canMutate}
                onIntegrationChange={(integrationId) =>
                  setRuntimeForm((f) => ({ ...f, integrationId, modelId: '' }))
                }
                onModelChange={(modelId) => setRuntimeForm((f) => ({ ...f, modelId }))}
              />
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Input
                  label={ru.agents.temperature}
                  type="number"
                  step="0.1"
                  min={0}
                  max={2}
                  disabled={!canMutate}
                  value={runtimeForm.temperature}
                  onChange={(e) =>
                    setRuntimeForm((f) => ({ ...f, temperature: Number(e.target.value) }))
                  }
                />
                <Input
                  label={ru.agents.topP}
                  type="number"
                  step="0.05"
                  min={0}
                  max={1}
                  disabled={!canMutate}
                  value={runtimeForm.topP}
                  onChange={(e) => setRuntimeForm((f) => ({ ...f, topP: Number(e.target.value) }))}
                />
                <Input
                  label={ru.agents.maxTokens}
                  type="number"
                  min={1}
                  max={128000}
                  disabled={!canMutate}
                  value={runtimeForm.maxTokens}
                  onChange={(e) =>
                    setRuntimeForm((f) => ({ ...f, maxTokens: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    disabled={!canMutate}
                    checked={runtimeForm.streamingEnabled}
                    onChange={(e) =>
                      setRuntimeForm((f) => ({ ...f, streamingEnabled: e.target.checked }))
                    }
                  />
                  Streaming
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    disabled={!canMutate}
                    checked={runtimeForm.toolsEnabled}
                    onChange={(e) =>
                      setRuntimeForm((f) => ({ ...f, toolsEnabled: e.target.checked }))
                    }
                  />
                  Tools
                </label>
              </div>
            </Card>
          )}

          {section === 'fallback' && (
            <Card className="p-4">
              {runtimeForm.integrationId && runtimeForm.modelId ? (
                <AgentFallbackChainEditor
                  primaryIntegrationId={runtimeForm.integrationId}
                  primaryModelId={runtimeForm.modelId}
                  fallbacks={runtimeForm.fallbacks}
                  integrations={activeIntegrations}
                  onChange={(fallbacks) => setRuntimeForm((f) => ({ ...f, fallbacks }))}
                />
              ) : (
                <p className="text-sm text-zinc-500">Select primary integration and model first.</p>
              )}
            </Card>
          )}

          {section === 'diagnostics' && <AgentDiagnosticsPanel agentId={id} />}
        </div>
      </div>
    </div>
  );
}
