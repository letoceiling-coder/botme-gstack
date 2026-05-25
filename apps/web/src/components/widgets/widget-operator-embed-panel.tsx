import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, ExternalLink, Loader2, RefreshCw, Shield, Zap } from 'lucide-react';
import { useState } from 'react';
import type { OperatorEmbedConnectionStatus, WidgetConnectionCenterDto } from '@botme/shared';
import { Badge, Button, Card } from '@botme/ui';
import { api, ApiError } from '@/lib/api';
import { CopyCard } from './copy-card';

type IntegrationTab = 'script' | 'iframe' | 'react' | 'vue' | 'nuxt' | 'next';

interface WidgetOperatorEmbedPanelProps {
  widgetId: string;
  center: WidgetConnectionCenterDto;
  canMutate: boolean;
}

const STATUS_LABEL: Record<OperatorEmbedConnectionStatus, string> = {
  connected: 'Подключено',
  partial: 'Частичное подключение',
  offline: 'Runtime offline',
};

const STATUS_COLOR: Record<OperatorEmbedConnectionStatus, string> = {
  connected: 'text-emerald-400',
  partial: 'text-amber-400',
  offline: 'text-red-400',
};

export function WidgetOperatorEmbedPanel({ widgetId, center, canMutate }: WidgetOperatorEmbedPanelProps) {
  const embed = center.operatorEmbed;
  const queryClient = useQueryClient();
  const [integrationTab, setIntegrationTab] = useState<IntegrationTab>('script');
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const validationQuery = useQuery({
    queryKey: ['widgets', widgetId, 'operator-validation'],
    queryFn: () => api.widgets.operatorEmbedValidation(widgetId),
    refetchInterval: 15_000,
    initialData: embed.validation,
  });

  const provisionMutation = useMutation({
    mutationFn: () => api.widgets.provisionOperatorConnection(widgetId),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['widgets', widgetId, 'connection-center'] });
      void queryClient.invalidateQueries({ queryKey: ['widgets', widgetId, 'operator-validation'] });
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Ошибка'),
  });

  const validation = validationQuery.data ?? embed.validation;
  const integrationTabs: { id: IntegrationTab; label: string; difficulty: string; minutes: number }[] = [
    { id: 'script', label: 'Script', difficulty: 'Легко', minutes: 1 },
    { id: 'iframe', label: 'iframe', difficulty: 'Легко', minutes: 1 },
    { id: 'react', label: 'React', difficulty: 'Средне', minutes: 2 },
    { id: 'vue', label: 'Vue', difficulty: 'Средне', minutes: 2 },
    { id: 'nuxt', label: 'Nuxt', difficulty: 'Средне', minutes: 3 },
    { id: 'next', label: 'Next', difficulty: 'Средне', minutes: 3 },
  ];

  const activeIntegration = embed.integrations.find((i) => {
    const map: Record<IntegrationTab, string> = {
      script: 'html-script',
      iframe: 'html-iframe',
      react: 'react',
      vue: 'vue',
      nuxt: 'nuxt',
      next: 'next',
    };
    return i.id === map[integrationTab];
  });

  const codePreview =
    integrationTab === 'script'
      ? embed.scriptEmbedCode
      : integrationTab === 'iframe'
        ? embed.iframeEmbedCode
        : (activeIntegration?.code ?? embed.scriptEmbedCode);

  const currentTab = integrationTabs.find((t) => t.id === integrationTab);

  const downloadZip = async () => {
    setDownloading(true);
    setError(null);
    try {
      await api.widgets.downloadOperatorSelfHostZip(
        widgetId,
        `botme-operator-${center.access.widgetName.replace(/\s+/g, '-').toLowerCase()}.zip`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось скачать архив');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                validation.status === 'connected'
                  ? 'bg-emerald-500/15'
                  : validation.status === 'partial'
                    ? 'bg-amber-500/15'
                    : 'bg-red-500/15'
              }`}
            >
              {validation.status === 'connected' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              ) : (
                <Zap className={`h-5 w-5 ${STATUS_COLOR[validation.status]}`} />
              )}
            </div>
            <div>
              <p className={`font-semibold ${STATUS_COLOR[validation.status]}`}>
                {STATUS_LABEL[validation.status]}
              </p>
              <p className="text-sm text-muted-foreground">
                {embed.connectionReady
                  ? 'Код готов — скопируйте и вставьте без правок'
                  : 'Настройка подключения…'}
              </p>
            </div>
          </div>
          {canMutate && (
            <Button
              variant="secondary"
              disabled={provisionMutation.isPending}
              onClick={() => provisionMutation.mutate()}
            >
              {provisionMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Перевыпустить подключение
            </Button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </Card>

      {/* Quick setup */}
      <Card className="space-y-4 p-4">
        <h3 className="font-medium">Быстрое подключение</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Step n={1} title="Скопируйте код" desc="Кнопка ниже — один клик" />
          <Step n={2} title="Вставьте перед </body>" desc="На страницу операторов" />
          <Step n={3} title="Готово" desc="~1 минута, без настройки" />
        </div>
        <CopyCard label="Operator embed — script" value={embed.scriptEmbedCode} prominent />
      </Card>

      {/* Token info — masked */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h4 className="font-medium">Runtime token</h4>
          <Badge variant="success">Активен</Badge>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Token" value={embed.activeToken?.tokenPrefix ?? '—'} />
          <Metric label="Использований" value={String(validation.tokenExchangeCount)} />
          <Metric
            label="Последнее использование"
            value={
              validation.tokenLastUsedAt
                ? new Date(validation.tokenLastUsedAt).toLocaleString('ru-RU')
                : 'Ещё не использовался'
            }
          />
          <Metric
            label="Истекает"
            value={
              validation.tokenExpiresAt
                ? new Date(validation.tokenExpiresAt).toLocaleDateString('ru-RU')
                : 'Без срока'
            }
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(embed.allowedDomains.length ? embed.allowedDomains : center.access.domains).map((d) => (
            <Badge key={d} variant="muted">
              {d}
            </Badge>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <ValidationChip ok={validation.operatorJsReachable} label="operator.js" />
          <ValidationChip ok={validation.tokenValid} label="Token" />
          <ValidationChip ok={validation.websocketReady} label="WebSocket" />
          <ValidationChip ok={validation.rtcAvailable} label="RTC" />
        </div>
      </Card>

      {/* Integrations */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-medium">Способ интеграции</h4>
          {currentTab && (
            <span className="text-xs text-muted-foreground">
              {currentTab.difficulty} · ~{currentTab.minutes} мин
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {integrationTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setIntegrationTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                integrationTab === t.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/30'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <CopyCard label={`Готовый код — ${integrationTab}`} value={codePreview} prominent />
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <CopyCard label="Standalone URL" value={embed.standaloneUrl} />
        <CopyCard label="Widget script (готов)" value={center.embedCode} />
      </div>

      {/* Live preview */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">Live preview</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Operators online: {validation.operatorsOnline}
            </span>
            <a
              href={embed.standaloneUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Открыть <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <iframe
          title="Operator preview"
          src={embed.runtimeUrl}
          className="h-[360px] w-full bg-[#0f1419]"
          allow="camera; microphone; fullscreen; autoplay; display-capture"
        />
      </Card>

      {/* Self-host */}
      <Card className="space-y-3 p-4">
        <h4 className="font-medium">Self-host / White-label</h4>
        <p className="text-sm text-muted-foreground">
          ZIP-архив с готовым `.env`, nginx конфигом, README и runtime assets — без ручной сборки.
        </p>
        <Button disabled={downloading} onClick={() => void downloadZip()}>
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Скачать self-host архив
        </Button>
      </Card>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
      <p className="text-xs font-semibold text-primary">ШАГ {n}</p>
      <p className="mt-1 font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/20 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  );
}

function ValidationChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={`rounded-md px-2 py-1 text-center ${ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted/30 text-muted-foreground'}`}
    >
      {ok ? '🟢' : '🔴'} {label}
    </div>
  );
}
