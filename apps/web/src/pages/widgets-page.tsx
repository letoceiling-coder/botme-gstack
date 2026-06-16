import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Headphones, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_LAUNCHER_CONFIG,
  type AssistantDto,
  type LauncherConfig,
  type WidgetDto,
  type WidgetConnectionCenterDto,
  type WidgetDetailDto,
} from '@botme/shared';
import { Badge, Button, Card, Input, Select, SelectOption } from '@botme/ui';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { CopyCard } from '@/components/widgets/copy-card';
import { BrowserDiagnosticsPanel, ServerHealthList } from '@/components/widgets/browser-diagnostics';
import { HealthStatusChip } from '@/components/widgets/health-status-chip';
import { WidgetOperatorsPanel } from '@/components/widgets/widget-operators-panel';
import { WidgetOperatorEmbedPanel } from '@/components/widgets/widget-operator-embed-panel';
import { WidgetStyleEditor } from '@/components/widgets/widget-style-editor';

type SetupTab = 'widget' | 'operator' | 'operators' | 'rtc' | 'diagnostics' | 'selfhost';

function widgetReadinessIssues(widget: WidgetDetailDto): string[] {
  const issues: string[] = [];
  if (!widget.isActive) issues.push('Виджет выключен');
  if (!widget.assistantIsActive || widget.assistantStatus !== 'ACTIVE') {
    issues.push('Ассистент в черновике или не опубликован');
  }
  if (widget.domains.length === 0) issues.push('Не настроены разрешённые домены');
  return issues;
}

export function WidgetsPage() {
  const role = useAuthStore((s) => s.session?.workspace.role);
  const canMutate = role === 'ADMIN' || role === 'OWNER';
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<SetupTab>('widget');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', assistantId: '', domains: '' });
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [setupWizardDismissedFor, setSetupWizardDismissedFor] = useState<string | null>(null);

  const widgetsQuery = useQuery({ queryKey: ['widgets'], queryFn: () => api.widgets.list() });
  const assistantsQuery = useQuery({ queryKey: ['assistants'], queryFn: () => api.assistants.list(), enabled: modalOpen });
  const detailQuery = useQuery({
    queryKey: ['widgets', selectedId],
    queryFn: () => api.widgets.get(selectedId!),
    enabled: Boolean(selectedId),
  });
  const centerQuery = useQuery({
    queryKey: ['widgets', selectedId, 'connection-center'],
    queryFn: () => api.widgets.connectionCenter(selectedId!),
    enabled: Boolean(selectedId),
    refetchInterval: 30_000,
  });
  const previewQuery = useQuery({
    queryKey: ['widgets', selectedId, 'preview-session'],
    queryFn: () => api.widgets.previewSession(selectedId!),
    enabled: Boolean(selectedId),
    staleTime: 12 * 60 * 1000,
    refetchInterval: 12 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.widgets.create({
        name: form.name,
        assistantId: form.assistantId,
        domains: form.domains.split('\n').map((d) => d.trim()).filter(Boolean),
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['widgets'] });
      setSelectedId(data.id);
      setModalOpen(false);
      setForm({ name: '', assistantId: '', domains: '' });
      setSetupWizardOpen(true);
      setSetupWizardDismissedFor(null);
      setError(null);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Ошибка'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.widgets.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['widgets'] });
      setSelectedId(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.widgets.update(id, { isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['widgets'] });
      void queryClient.invalidateQueries({ queryKey: ['widgets', selectedId] });
      void queryClient.invalidateQueries({ queryKey: ['widgets', selectedId, 'connection-center'] });
    },
  });

  const selected = detailQuery.data;
  const center = centerQuery.data;
  const assistants = assistantsQuery.data ?? [];
  const readinessIssues = selected ? widgetReadinessIssues(selected) : [];

  useEffect(() => {
    if (!selected || readinessIssues.length === 0 || setupWizardDismissedFor === selected.id) return;
    setSetupWizardOpen(true);
  }, [
    selected?.id,
    selected?.isActive,
    selected?.assistantIsActive,
    selected?.assistantStatus,
    selected?.domains.length,
    readinessIssues.length,
    setupWizardDismissedFor,
  ]);

  const fixSetupMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      await api.assistants.update(selected.assistantId, { isActive: true, status: 'ACTIVE' });
      await api.widgets.update(selected.id, { isActive: true });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['widgets'] });
      await queryClient.invalidateQueries({ queryKey: ['widgets', selectedId] });
      await queryClient.invalidateQueries({ queryKey: ['widgets', selectedId, 'connection-center'] });
      setSetupWizardOpen(false);
      setSetupWizardDismissedFor(null);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Ошибка настройки виджета'),
  });

  const tabs: { id: SetupTab; label: string }[] = [
    { id: 'widget', label: 'Виджет' },
    { id: 'operator', label: 'Кабинет оператора' },
    { id: 'operators', label: 'Операторы' },
    { id: 'rtc', label: 'RTC' },
    { id: 'diagnostics', label: 'Диагностика' },
    { id: 'selfhost', label: 'Self-host' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Connection Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Виджет, операторы, RTC, диагностика и self-host — всё для подключения без разработчика.
          </p>
        </div>
        {canMutate && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Создать виджет
          </Button>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.6fr)_minmax(260px,1fr)]">
        {/* LEFT — widgets list */}
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Виджеты</p>
          {(widgetsQuery.data ?? []).map((w: WidgetDto) => (
            <div
              key={w.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(w.id)}
              onKeyDown={(e) => e.key === 'Enter' && setSelectedId(w.id)}
            >
              <Card
                className={`cursor-pointer p-4 transition ${selectedId === w.id ? 'border-primary shadow-[0_0_24px_rgba(57,255,20,0.08)]' : 'hover:border-primary/30'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-medium">{w.name}</h3>
                    <p className="text-xs text-muted-foreground">{w.assistantName}</p>
                  </div>
                  <Badge variant={w.isActive ? 'success' : 'muted'}>{w.isActive ? 'Active' : 'Off'}</Badge>
                </div>
              </Card>
            </div>
          ))}
          {widgetsQuery.data?.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">Виджетов пока нет.</Card>
          )}
        </div>

        {/* CENTER — setup tabs */}
        <div className="min-w-0 space-y-4">
          {!selected ? (
            <Card className="flex h-64 items-center justify-center p-8 text-sm text-muted-foreground">
              Выберите виджет для настройки подключения.
            </Card>
          ) : detailQuery.isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 border-b border-border pb-3">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`rounded-lg px-3 py-1.5 text-sm transition ${
                      tab === t.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/30'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'widget' && selected && center && (
                <WidgetSetupTab
                  selected={selected}
                  center={center}
                  canMutate={canMutate}
                  onToggle={() => toggleMutation.mutate({ id: selected.id, isActive: !selected.isActive })}
                  onDelete={() => deleteMutation.mutate(selected.id)}
                  onOpenSetupWizard={() => setSetupWizardOpen(true)}
                />
              )}

              {tab === 'operator' && selected && center && (
                <WidgetOperatorEmbedPanel widgetId={selected.id} center={center} canMutate={canMutate} />
              )}

              {tab === 'operators' && <WidgetOperatorsPanel />}

              {tab === 'rtc' && center && <RtcGuideTab center={center} />}

              {tab === 'diagnostics' && center && (
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-2 text-lg font-semibold">Серверные проверки</h3>
                    <ServerHealthList checks={center.health.checks} />
                  </div>
                  <div>
                    <h3 className="mb-2 text-lg font-semibold">Браузерные проверки</h3>
                    <BrowserDiagnosticsPanel />
                  </div>
                </div>
              )}

              {tab === 'selfhost' && center && <SelfHostTab center={center} />}
            </>
          )}
        </div>

        {/* RIGHT — preview + health */}
        <div className="space-y-4">
          {center && (
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Live health</p>
                <HealthStatusChip status={center.health.overall} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-muted/20 p-2">
                  <p className="text-muted-foreground">Widget WS</p>
                  <p className="font-semibold">{center.health.widgetSocketsOnline}</p>
                </div>
                <div className="rounded-lg bg-muted/20 p-2">
                  <p className="text-muted-foreground">Operators</p>
                  <p className="font-semibold">{center.health.operatorSocketsOnline}</p>
                </div>
              </div>
            </Card>
          )}

          {center && (
            <Card className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <Headphones className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Подключение операторов</p>
              </div>
              <CopyCard label="Admin operator" value={center.operatorUrls.adminOperatorUrl} />
              <CopyCard label="operator.js" value={center.operatorUrls.operatorJsUrl} />
              <CopyCard label="Operator runtime" value={center.operatorUrls.operatorRuntimeUrl} />
            </Card>
          )}

          {selected && (
            <Card className="overflow-hidden p-0">
              <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">Live preview</div>
              {previewQuery.isLoading && !previewQuery.data ? (
                <div className="flex h-[420px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <iframe
                  title="Widget preview"
                  key={previewQuery.data?.previewToken ?? selected.publicKey}
                  src={previewQuery.data?.previewUrl ?? `/widget/?widgetKey=${selected.publicKey}`}
                  className="h-[420px] w-full bg-background"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              )}
            </Card>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-medium">Новый виджет</h2>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <Input placeholder="Название" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <Select value={form.assistantId} onChange={(e) => setForm((f) => ({ ...f, assistantId: e.target.value }))}>
                <SelectOption value="">Выберите ассистента</SelectOption>
                {assistants.map((a: AssistantDto) => (
                  <SelectOption key={a.id} value={a.id}>
                    {a.name}
                  </SelectOption>
                ))}
              </Select>
              <textarea
                className="min-h-[80px] w-full rounded-lg border border-border bg-background p-3 text-sm"
                placeholder={'example.com\nwww.example.com'}
                value={form.domains}
                onChange={(e) => setForm((f) => ({ ...f, domains: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Указывайте домены без <code>https://</code>. После создания откроется мастер с готовым скриптом.
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                className="w-full"
                disabled={!form.name || !form.assistantId || !form.domains.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Создать
              </Button>
            </div>
          </Card>
        </div>
      )}

      {selected && setupWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-xl space-y-5 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Мастер запуска</p>
                <h2 className="mt-1 text-lg font-semibold">Подготовить виджет к установке</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  После этих шагов пользователь копирует скрипт, вставляет на сайт перед <code>&lt;/body&gt;</code>, и виджет работает.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSetupWizardOpen(false);
                  setSetupWizardDismissedFor(selected.id);
                }}
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-2">
              {[
                { label: 'Виджет включён', ok: selected.isActive },
                { label: 'Ассистент опубликован', ok: selected.assistantIsActive && selected.assistantStatus === 'ACTIVE' },
                { label: 'Домены указаны', ok: selected.domains.length > 0 },
              ].map((item, index) => (
                <div key={item.label} className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/10 p-3">
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                      item.ok ? 'bg-primary/20 text-primary' : 'bg-amber-500/20 text-amber-200'
                    }`}
                  >
                    {item.ok ? '✓' : index + 1}
                  </span>
                  <span className={item.ok ? 'text-foreground' : 'text-amber-100'}>{item.label}</span>
                </div>
              ))}
            </div>

            {selected.domains.length === 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                Сначала добавьте домен сайта в настройках виджета. Без домена публичный <code>widget.js</code> будет отклонён защитой.
              </div>
            )}

            <CopyCard
              label="Готовый скрипт"
              value={center?.embedCode ?? selected.embedCode}
              prominent
              hint="Вставьте код перед закрывающим тегом </body> на сайте."
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setSetupWizardOpen(false);
                  setSetupWizardDismissedFor(selected.id);
                }}
              >
                Закрыть
              </Button>
              <Button
                disabled={selected.domains.length === 0}
                loading={fixSetupMutation.isPending}
                onClick={() => fixSetupMutation.mutate()}
              >
                Исправить и опубликовать
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function WidgetSetupTab({
  selected,
  center,
  canMutate,
  onToggle,
  onDelete,
  onOpenSetupWizard,
}: {
  selected: WidgetDetailDto;
  center: WidgetConnectionCenterDto;
  canMutate: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onOpenSetupWizard: () => void;
}) {
  const queryClient = useQueryClient();
  const [launcher, setLauncher] = useState<LauncherConfig>({
    ...DEFAULT_LAUNCHER_CONFIG,
    ...(selected.launcherConfig ?? {}),
  });

  useEffect(() => {
    setLauncher({ ...DEFAULT_LAUNCHER_CONFIG, ...(selected.launcherConfig ?? {}) });
  }, [selected.id, selected.updatedAt, selected.launcherConfig]);

  const saveStyleMutation = useMutation({
    mutationFn: () => api.widgets.update(selected.id, { launcherConfig: launcher }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['widgets'] });
      await queryClient.invalidateQueries({ queryKey: ['widgets', selected.id] });
      await queryClient.invalidateQueries({ queryKey: ['widgets', selected.id, 'preview-session'] });
    },
  });

  return (
    <div className="space-y-4">
      {widgetReadinessIssues(selected).length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-amber-100">Виджет ещё не готов к установке</p>
              <p className="mt-1 text-sm text-amber-100/80">{widgetReadinessIssues(selected).join(' · ')}</p>
            </div>
            <Button onClick={onOpenSetupWizard}>Открыть мастер</Button>
          </div>
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">{selected.name}</h2>
          {canMutate && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onToggle}>
                {selected.isActive ? 'Выключить' : 'Включить'}
              </Button>
              <Button variant="danger" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Workspace:</span> {center.access.workspaceName}
          </p>
          <p>
            <span className="text-muted-foreground">Ассистент:</span> {center.access.assistantName}
          </p>
          <p>
            <span className="text-muted-foreground">RTC:</span>{' '}
            {center.access.rtcEnabled ? 'включён' : 'выключен'}
          </p>
          <p>
            <span className="text-muted-foreground">Статус:</span>{' '}
            {center.access.isActive ? 'активен' : 'выключен'}
          </p>
        </div>
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-medium">Инструкция — подключение виджета</h3>
        <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          {center.installSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <CopyCard label="Embed code — виджет" value={center.embedCode} prominent hint="Готово к использованию" />
      </div>

      <Card className="space-y-4 p-4">
        <WidgetStyleEditor
          value={launcher}
          disabled={!canMutate}
          onChange={setLauncher}
          onUploadLauncherIcon={(file) => api.widgets.uploadLauncherIcon(selected.id, file).then((res) => res.url)}
        />
        {canMutate && (
          <Button loading={saveStyleMutation.isPending} onClick={() => saveStyleMutation.mutate()} className="gap-2">
            Сохранить дизайн виджета
          </Button>
        )}
      </Card>

      <div>
        <p className="mb-2 text-sm font-medium">Разрешённые домены</p>
        <div className="flex flex-wrap gap-2">
          {selected.domains.map((d) => (
            <Badge key={d} variant="muted">
              {d}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Инструкция — подключение операторов</h3>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Откройте панель оператора по ссылке выше.</li>
          <li>Войдите под учётной записью workspace (роль OPERATOR или выше).</li>
          <li>Выберите посетителя в списке диалогов.</li>
          <li>Нажмите «Перехватить чат» для takeover или «Видеозвонок» для RTC.</li>
          <li>Примите звонок на стороне посетителя в виджете.</li>
        </ol>
      </div>
    </div>
  );
}

function RtcGuideTab({ center }: { center: WidgetConnectionCenterDto }) {
  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <h3 className="font-medium">RTC / Видеозвонки</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• HTTPS обязателен для камеры и микрофона.</li>
          <li>• Поддерживаются Chrome, Safari, Firefox (desktop + mobile).</li>
          <li>• TURN: {center.selfHost.turnHost} — для NAT/cellular.</li>
          <li>• При обрыве связи клиент выполняет ICE restart и переподключение WebSocket.</li>
          <li>• Разрешите camera/microphone в браузере при первом звонке.</li>
        </ul>
      </Card>
      <CopyCard label="TURN UDP" value={center.selfHost.turnUdp} />
      <CopyCard label="TURN TCP" value={center.selfHost.turnTcp} />
      <CopyCard label="WebSocket" value={center.operatorUrls.websocketUrl} />
    </div>
  );
}

function SelfHostTab({ center }: { center: WidgetConnectionCenterDto }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">White Label / Self-host — готовые конфиги для копирования.</p>
      <CopyCard label="widget.js" value={center.selfHost.widgetJsUrl} />
      <CopyCard label="operator.js" value={center.selfHost.operatorJsUrl} />
      <CopyCard label="operator-runtime package" value={center.selfHost.operatorRuntimePackagePath} />
      <CopyCard label="WebSocket endpoint" value={center.selfHost.websocketUrl} />
      <CopyCard label="RTC signaling" value={center.selfHost.rtcSignalingPath} />
      <CopyCard label="Permissions-Policy" value={center.selfHost.permissionsPolicyExample} />
      <CopyCard label="nginx — widget" value={center.selfHost.nginxSnippet} mono />
      <CopyCard label="nginx — operator" value={center.selfHost.operatorNginxSnippet} mono />
      <CopyCard label="CSP example" value={center.selfHost.cspExample} mono />
    </div>
  );
}
