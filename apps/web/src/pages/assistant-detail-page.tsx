import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  Loader2,
  MessageSquare,
  Network,
  Palette,
  Phone,
  Save,
  Settings2,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { AgentDto, KnowledgeBaseDto, ToolDto } from '@botme/shared';
import { Badge, Button, Card, Input, Select, SelectOption } from '@botme/ui';
import { DEFAULT_LAUNCHER_CONFIG, type LauncherConfig } from '@botme/shared';
import { api, ApiError } from '@/lib/api';
import { ru } from '@/i18n/ru';
import { useAuthStore } from '@/stores/auth';

const TABS = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'runtime', label: 'Runtime', icon: Network },
  { id: 'kb', label: 'Knowledge', icon: BookOpen },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'widget', label: 'Widget', icon: Palette },
  { id: 'rtc', label: 'RTC', icon: Phone },
] as const;

type TabId = (typeof TABS)[number]['id'];

type RtcConfig = {
  audioEnabled: boolean;
  videoEnabled: boolean;
  takeoverPolicy: 'auto' | 'manual' | 'visitor-request';
  reconnectPolicy: 'auto' | 'prompt' | 'disabled';
  turnPolicy: 'auto' | 'required' | 'disabled';
};

const DEFAULT_RTC: RtcConfig = {
  audioEnabled: true,
  videoEnabled: true,
  takeoverPolicy: 'visitor-request',
  reconnectPolicy: 'auto',
  turnPolicy: 'auto',
};

export function AssistantDetailPage() {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as TabId) || 'general';
  const role = useAuthStore((s) => s.session?.workspace.role);
  const canMutate = role === 'ADMIN' || role === 'OWNER' || role === 'MEMBER';
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const assistantQuery = useQuery({
    queryKey: ['assistant', id],
    queryFn: () => api.assistants.get(id),
    enabled: !!id,
  });

  const runtimeQuery = useQuery({
    queryKey: ['assistant-runtime', id],
    queryFn: () => api.assistants.runtime(id),
    enabled: !!id,
  });

  const agentsQuery = useQuery({ queryKey: ['agents'], queryFn: () => api.agents.list() });
  const kbsQuery = useQuery({ queryKey: ['kbs'], queryFn: () => api.knowledgeBases.list() });
  const toolsQuery = useQuery({ queryKey: ['tools'], queryFn: () => api.tools.list() });
  const widgetsQuery = useQuery({ queryKey: ['widgets'], queryFn: () => api.widgets.list() });

  const assistant = assistantQuery.data;
  const linkedWidgets = useMemo(
    () => (widgetsQuery.data ?? []).filter((w) => w.assistantId === id),
    [widgetsQuery.data, id],
  );

  const [general, setGeneral] = useState({
    name: '',
    avatarUrl: '',
    language: 'ru',
    welcomeMessage: '',
    placeholder: '',
    tone: 'neutral',
  });

  const [runtimeSettings, setRuntimeSettings] = useState({
    maxContextMessages: 20,
    memoryEnabled: true,
    streamingEnabled: true,
    citationsEnabled: false,
    moderationEnabled: true,
    fallbackMessage: '',
    typingSimulation: true,
  });

  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [kbIds, setKbIds] = useState<string[]>([]);
  const [toolIds, setToolIds] = useState<string[]>([]);
  const [launcher, setLauncher] = useState<LauncherConfig>(DEFAULT_LAUNCHER_CONFIG);
  const [widgetId, setWidgetId] = useState('');
  const [rtc, setRtc] = useState<RtcConfig>(DEFAULT_RTC);

  useEffect(() => {
    if (!assistant) return;
    setGeneral({
      name: assistant.name,
      avatarUrl: assistant.avatarUrl ?? '',
      language: assistant.language,
      welcomeMessage: assistant.welcomeMessage,
      placeholder: assistant.placeholder,
      tone: assistant.tone,
    });
    setRuntimeSettings({
      maxContextMessages: assistant.runtimeSettings.maxContextMessages,
      memoryEnabled: assistant.runtimeSettings.memoryEnabled,
      streamingEnabled: assistant.runtimeSettings.streamingEnabled,
      citationsEnabled: assistant.runtimeSettings.citationsEnabled,
      moderationEnabled: assistant.runtimeSettings.moderationEnabled,
      fallbackMessage: assistant.runtimeSettings.fallbackMessage,
      typingSimulation: assistant.runtimeSettings.typingSimulation,
    });
    setSelectedAgentId(assistant.agentId);
    setKbIds(assistant.knowledgeBaseIds);
    setToolIds(assistant.toolIds);
    const esc = assistant.escalation as Partial<RtcConfig> | null;
    if (esc) {
      setRtc({ ...DEFAULT_RTC, ...esc });
    }
  }, [assistant?.id, assistant?.updatedAt]);

  useEffect(() => {
    const w = linkedWidgets[0];
    if (!w) return;
    setWidgetId(w.id);
    setLauncher({ ...DEFAULT_LAUNCHER_CONFIG, ...(w.launcherConfig ?? {}) });
  }, [linkedWidgets]);

  const setTab = (next: TabId) => {
    setSearchParams({ tab: next });
  };

  const saveGeneralMutation = useMutation({
    mutationFn: () =>
      api.assistants.update(id, {
        name: general.name,
        avatarUrl: general.avatarUrl || null,
        language: general.language,
        welcomeMessage: general.welcomeMessage,
        placeholder: general.placeholder,
        tone: general.tone,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assistant', id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : ru.common.error),
  });

  const saveRuntimeMutation = useMutation({
    mutationFn: async () => {
      if (selectedAgentId !== assistant?.agentId) {
        await api.assistants.bindAgent(id, selectedAgentId);
      }
      await api.assistants.update(id, { runtimeSettings });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assistant', id] });
      await queryClient.invalidateQueries({ queryKey: ['assistant-runtime', id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : ru.common.error),
  });

  const saveKbMutation = useMutation({
    mutationFn: () => api.assistants.bindKbs(id, kbIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assistant', id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : ru.common.error),
  });

  const saveToolsMutation = useMutation({
    mutationFn: () => api.assistants.bindTools(id, toolIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assistant', id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : ru.common.error),
  });

  const saveWidgetMutation = useMutation({
    mutationFn: () => {
      if (!widgetId) throw new Error('No widget linked');
      return api.widgets.update(widgetId, { launcherConfig: launcher });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['widgets'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : ru.common.error),
  });

  const saveRtcMutation = useMutation({
    mutationFn: () => api.assistants.update(id, { escalation: rtc }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assistant', id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : ru.common.error),
  });

  if (assistantQuery.isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#39ff14]" />
      </div>
    );
  }

  if (!assistant) {
    return <p className="text-zinc-500">{ru.common.error}</p>;
  }

  const linkedAgent = (agentsQuery.data ?? []).find((a: AgentDto) => a.id === assistant.agentId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            to="/admin/assistants"
            className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {ru.assistants.title}
          </Link>
          <h1 className="text-2xl font-semibold text-white">{assistant.name}</h1>
          <p className="text-sm text-zinc-400">Orchestration hub · {assistant.slug}</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/admin/assistants/${id}/chat`}>
            <Button variant="secondary" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              {ru.assistants.testChat}
            </Button>
          </Link>
          {saved && <Badge variant="success">Saved</Badge>}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {TABS.map(({ id: tid, label, icon: Icon }) => (
          <button
            key={tid}
            type="button"
            onClick={() => setTab(tid)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              tab === tid ? 'bg-[#39ff14]/10 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <Card className="space-y-4 p-4">
          <Input label={ru.assistants.name} value={general.name} disabled={!canMutate} onChange={(e) => setGeneral({ ...general, name: e.target.value })} />
          <Input label="Avatar URL" value={general.avatarUrl} disabled={!canMutate} onChange={(e) => setGeneral({ ...general, avatarUrl: e.target.value })} />
          <Input label="Language" value={general.language} disabled={!canMutate} onChange={(e) => setGeneral({ ...general, language: e.target.value })} />
          <Input label="Welcome message" value={general.welcomeMessage} disabled={!canMutate} onChange={(e) => setGeneral({ ...general, welcomeMessage: e.target.value })} />
          <Input label="Placeholder" value={general.placeholder} disabled={!canMutate} onChange={(e) => setGeneral({ ...general, placeholder: e.target.value })} />
          {canMutate && (
            <Button loading={saveGeneralMutation.isPending} onClick={() => saveGeneralMutation.mutate()} className="gap-2">
              <Save className="h-4 w-4" /> Save
            </Button>
          )}
        </Card>
      )}

      {tab === 'runtime' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-4 p-4">
            <h3 className="text-sm font-medium text-[#39ff14]">Linked agent</h3>
            <Select value={selectedAgentId} disabled={!canMutate} onChange={(e) => setSelectedAgentId(e.target.value)}>
              {(agentsQuery.data ?? []).filter((a: AgentDto) => a.status === 'ACTIVE').map((a) => (
                <SelectOption key={a.id} value={a.id}>{a.name} · {a.modelId}</SelectOption>
              ))}
            </Select>
            {linkedAgent && (
              <div className="text-xs text-zinc-400">
                <p>Integration: {linkedAgent.integrationName}</p>
                <p>Fallbacks: {linkedAgent.fallbacks.length}</p>
                <Link to={`/admin/agents/${linkedAgent.id}`} className="text-[#39ff14] hover:underline">
                  Open agent runtime editor →
                </Link>
              </div>
            )}
            <h3 className="text-sm font-medium text-[#39ff14]">Runtime settings</h3>
            {Object.entries(runtimeSettings).map(([key, val]) =>
              typeof val === 'boolean' ? (
                <label key={key} className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" disabled={!canMutate} checked={val} onChange={(e) => setRuntimeSettings({ ...runtimeSettings, [key]: e.target.checked })} />
                  {key}
                </label>
              ) : key === 'fallbackMessage' ? (
                <Input key={key} label={key} disabled={!canMutate} value={String(val)} onChange={(e) => setRuntimeSettings({ ...runtimeSettings, fallbackMessage: e.target.value })} />
              ) : (
                <Input key={key} label={key} type="number" disabled={!canMutate} value={Number(val)} onChange={(e) => setRuntimeSettings({ ...runtimeSettings, [key]: Number(e.target.value) })} />
              ),
            )}
            {canMutate && (
              <Button loading={saveRuntimeMutation.isPending} onClick={() => saveRuntimeMutation.mutate()} className="gap-2">
                <Save className="h-4 w-4" /> Save runtime
              </Button>
            )}
          </Card>
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-medium text-[#39ff14]">Active snapshot</h3>
            {runtimeQuery.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : runtimeQuery.data ? (
              <dl className="space-y-2 text-sm text-zinc-300">
                <div className="flex justify-between"><dt>Model</dt><dd className="font-mono text-xs">{runtimeQuery.data.agent.modelId}</dd></div>
                <div className="flex justify-between"><dt>Integration</dt><dd>{runtimeQuery.data.integration.name}</dd></div>
                <div className="flex justify-between"><dt>Provider</dt><dd>{runtimeQuery.data.integration.provider}</dd></div>
                <div className="flex justify-between"><dt>Prompt</dt><dd>v{runtimeQuery.data.promptVersion.version}</dd></div>
                <div className="flex justify-between"><dt>KB</dt><dd>{runtimeQuery.data.knowledgeBases.length}</dd></div>
                <div className="flex justify-between"><dt>Tools</dt><dd>{runtimeQuery.data.tools.length}</dd></div>
              </dl>
            ) : (
              <p className="text-sm text-zinc-500">Snapshot unavailable</p>
            )}
          </Card>
        </div>
      )}

      {tab === 'kb' && (
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-medium text-[#39ff14]">Knowledge bases</h3>
          {(kbsQuery.data ?? []).map((kb: KnowledgeBaseDto) => (
            <label key={kb.id} className="flex items-center justify-between rounded-lg border border-white/10 p-3">
              <span className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" disabled={!canMutate} checked={kbIds.includes(kb.id)} onChange={() => setKbIds((ids) => ids.includes(kb.id) ? ids.filter((x) => x !== kb.id) : [...ids, kb.id])} />
                {kb.name}
              </span>
              <Badge variant="muted">{kb.status}</Badge>
            </label>
          ))}
          {canMutate && (
            <Button loading={saveKbMutation.isPending} onClick={() => saveKbMutation.mutate()} className="gap-2">
              <Save className="h-4 w-4" /> Save KB bindings
            </Button>
          )}
        </Card>
      )}

      {tab === 'tools' && (
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-medium text-[#39ff14]">Tools</h3>
          {(toolsQuery.data ?? []).map((tool: ToolDto) => (
            <label key={tool.id} className="flex items-center justify-between rounded-lg border border-white/10 p-3">
              <span className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" disabled={!canMutate} checked={toolIds.includes(tool.id)} onChange={() => setToolIds((ids) => ids.includes(tool.id) ? ids.filter((x) => x !== tool.id) : [...ids, tool.id])} />
                {tool.name}
              </span>
              <Badge variant="muted">{tool.type}</Badge>
            </label>
          ))}
          {canMutate && (
            <Button loading={saveToolsMutation.isPending} onClick={() => saveToolsMutation.mutate()} className="gap-2">
              <Save className="h-4 w-4" /> Save tool bindings
            </Button>
          )}
        </Card>
      )}

      {tab === 'widget' && (
        <Card className="space-y-4 p-4">
          {linkedWidgets.length === 0 ? (
            <p className="text-sm text-zinc-500">No widget linked. Create one in Widgets admin.</p>
          ) : (
            <>
              <Select value={widgetId} onChange={(e) => {
                setWidgetId(e.target.value);
                const w = linkedWidgets.find((x) => x.id === e.target.value);
                if (w?.launcherConfig) setLauncher({ ...DEFAULT_LAUNCHER_CONFIG, ...w.launcherConfig });
              }}>
                {linkedWidgets.map((w) => (
                  <SelectOption key={w.id} value={w.id}>{w.name} ({w.publicKey})</SelectOption>
                ))}
              </Select>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Primary color" value={launcher.primaryColor} disabled={!canMutate} onChange={(e) => setLauncher({ ...launcher, primaryColor: e.target.value })} />
                <Input label="Secondary color" value={launcher.secondaryColor} disabled={!canMutate} onChange={(e) => setLauncher({ ...launcher, secondaryColor: e.target.value })} />
                <Input label="Launcher icon" value={launcher.launcherIcon} disabled={!canMutate} onChange={(e) => setLauncher({ ...launcher, launcherIcon: e.target.value })} />
                <Input label="Widget title" value={launcher.widgetTitle ?? ''} disabled={!canMutate} onChange={(e) => setLauncher({ ...launcher, widgetTitle: e.target.value })} />
                <Input label="Welcome" value={launcher.welcomeMessage ?? ''} disabled={!canMutate} onChange={(e) => setLauncher({ ...launcher, welcomeMessage: e.target.value })} className="sm:col-span-2" />
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" disabled={!canMutate} checked={launcher.darkMode} onChange={(e) => setLauncher({ ...launcher, darkMode: e.target.checked })} />
                Premium dark theme
              </label>
              {canMutate && (
                <Button loading={saveWidgetMutation.isPending} onClick={() => saveWidgetMutation.mutate()} className="gap-2">
                  <Save className="h-4 w-4" /> Save widget theme
                </Button>
              )}
            </>
          )}
        </Card>
      )}

      {tab === 'rtc' && (
        <Card className="space-y-4 p-4">
          <h3 className="text-sm font-medium text-[#39ff14]">RTC policy</h3>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" disabled={!canMutate} checked={rtc.audioEnabled} onChange={(e) => setRtc({ ...rtc, audioEnabled: e.target.checked })} />
            Audio enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" disabled={!canMutate} checked={rtc.videoEnabled} onChange={(e) => setRtc({ ...rtc, videoEnabled: e.target.checked })} />
            Video enabled
          </label>
          <label className="block text-sm text-zinc-400">
            Takeover policy
            <Select className="mt-1" value={rtc.takeoverPolicy} disabled={!canMutate} onChange={(e) => setRtc({ ...rtc, takeoverPolicy: e.target.value as RtcConfig['takeoverPolicy'] })}>
              <SelectOption value="auto">Auto</SelectOption>
              <SelectOption value="manual">Manual</SelectOption>
              <SelectOption value="visitor-request">Visitor request</SelectOption>
            </Select>
          </label>
          <label className="block text-sm text-zinc-400">
            Reconnect policy
            <Select className="mt-1" value={rtc.reconnectPolicy} disabled={!canMutate} onChange={(e) => setRtc({ ...rtc, reconnectPolicy: e.target.value as RtcConfig['reconnectPolicy'] })}>
              <SelectOption value="auto">Auto</SelectOption>
              <SelectOption value="prompt">Prompt</SelectOption>
              <SelectOption value="disabled">Disabled</SelectOption>
            </Select>
          </label>
          <label className="block text-sm text-zinc-400">
            TURN policy
            <Select className="mt-1" value={rtc.turnPolicy} disabled={!canMutate} onChange={(e) => setRtc({ ...rtc, turnPolicy: e.target.value as RtcConfig['turnPolicy'] })}>
              <SelectOption value="auto">Auto</SelectOption>
              <SelectOption value="required">Required</SelectOption>
              <SelectOption value="disabled">Disabled</SelectOption>
            </Select>
          </label>
          {canMutate && (
            <Button loading={saveRtcMutation.isPending} onClick={() => saveRtcMutation.mutate()} className="gap-2">
              <Save className="h-4 w-4" /> Save RTC policy
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
