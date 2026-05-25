import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { OperatorConnectionCenterDto, OperatorRuntimeTokenDto, WidgetConnectionCenterDto } from '@botme/shared';
import { Badge, Button, Card, Input } from '@botme/ui';
import { api, ApiError } from '@/lib/api';
import { CopyCard } from './copy-card';
import { HealthStatusChip } from './health-status-chip';

type IntegrationTab = 'script' | 'iframe' | 'react' | 'vue' | 'nuxt' | 'next';

interface WidgetOperatorEmbedPanelProps {
  widgetId: string;
  center: WidgetConnectionCenterDto;
  canMutate: boolean;
}

export function WidgetOperatorEmbedPanel({ widgetId, center, canMutate }: WidgetOperatorEmbedPanelProps) {
  const embed = center.operatorEmbed;
  const queryClient = useQueryClient();
  const [integrationTab, setIntegrationTab] = useState<IntegrationTab>('script');
  const [newTokenName, setNewTokenName] = useState('Production operator');
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tokensQuery = useQuery({
    queryKey: ['widgets', widgetId, 'operator-tokens'],
    queryFn: () => api.widgets.listOperatorTokens(widgetId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.widgets.createOperatorToken(widgetId, {
        name: newTokenName,
        allowedDomains: center.access.domains,
      }),
    onSuccess: (data) => {
      setPlainToken(data.plainToken ?? null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['widgets', widgetId, 'operator-tokens'] });
      void queryClient.invalidateQueries({ queryKey: ['widgets', widgetId, 'connection-center'] });
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Ошибка'),
  });

  const revokeMutation = useMutation({
    mutationFn: (tokenId: string) => api.widgets.revokeOperatorToken(widgetId, tokenId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['widgets', widgetId, 'operator-tokens'] });
      void queryClient.invalidateQueries({ queryKey: ['widgets', widgetId, 'connection-center'] });
    },
  });

  const integrationMap: Record<IntegrationTab, string> = {
    script: embed.scriptEmbedCode,
    iframe: embed.iframeEmbedCode,
    react: embed.integrations.find((i) => i.id === 'react')?.code ?? '',
    vue: embed.integrations.find((i) => i.id === 'vue')?.code ?? '',
    nuxt: embed.integrations.find((i) => i.id === 'nuxt')?.code ?? '',
    next: embed.integrations.find((i) => i.id === 'next')?.code ?? '',
  };

  const integrationTabs: { id: IntegrationTab; label: string }[] = [
    { id: 'script', label: 'Script' },
    { id: 'iframe', label: 'iframe' },
    { id: 'react', label: 'React' },
    { id: 'vue', label: 'Vue' },
    { id: 'nuxt', label: 'Nuxt' },
    { id: 'next', label: 'Next' },
  ];

  const displayToken = plainToken ?? embed.activeToken?.tokenPrefix ?? 'YOUR_OPERATOR_TOKEN';

  const scriptWithToken = embed.scriptEmbedCode.replace(/YOUR_OPERATOR_TOKEN|ort_[\w-]+…/g, displayToken);
  const iframeWithToken = embed.iframeEmbedCode.replace(/YOUR_OPERATOR_TOKEN|ort_[\w-]+…/g, displayToken);
  const codePreview =
    integrationTab === 'script'
      ? scriptWithToken
      : integrationTab === 'iframe'
        ? iframeWithToken
        : integrationMap[integrationTab].replace(/YOUR_OPERATOR_TOKEN|ort_[\w-]+…/g, displayToken);

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-medium">Подключение кабинета оператора</h3>
            <p className="text-sm text-muted-foreground">
              Embed operator panel на ваш сайт через script, iframe или фреймворк.
            </p>
          </div>
          <HealthStatusChip status={center.health.overall} />
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg bg-muted/20 p-2">
            <p className="text-muted-foreground">Operators online</p>
            <p className="font-semibold">{center.health.operatorSocketsOnline}</p>
          </div>
          <div className="rounded-lg bg-muted/20 p-2">
            <p className="text-muted-foreground">Widget WS</p>
            <p className="font-semibold">{center.health.widgetSocketsOnline}</p>
          </div>
          <div className="rounded-lg bg-muted/20 p-2">
            <p className="text-muted-foreground">RTC</p>
            <p className="font-semibold">{center.access.rtcEnabled ? 'ON' : 'OFF'}</p>
          </div>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h4 className="font-medium">Runtime token</h4>
        </div>
        {plainToken && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Сохраните token — он показывается один раз.
            </p>
            <CopyCard label="Operator runtime token" value={plainToken} />
          </div>
        )}
        {canMutate && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Название token"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
            />
            <Button
              disabled={!newTokenName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Сгенерировать token
            </Button>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="space-y-2">
          {(tokensQuery.data ?? []).map((token: OperatorRuntimeTokenDto) => (
            <div
              key={token.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm"
            >
              <div>
                <p className="font-medium">{token.name}</p>
                <p className="text-xs text-muted-foreground">{token.tokenPrefix}…</p>
              </div>
              {canMutate && (
                <Button
                  variant="danger"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(token.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
          {tokensQuery.isLoading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Allowed domains
          </p>
          <div className="flex flex-wrap gap-2">
            {embed.allowedDomains.length ? (
              embed.allowedDomains.map((d) => (
                <Badge key={d} variant="muted">
                  {d}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">Любой домен (не рекомендуется для prod)</span>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <CopyCard label="Standalone URL" value={embed.standaloneUrl.replace(/YOUR_OPERATOR_TOKEN|ort_[\w-]+…/g, displayToken)} />
        <CopyCard label="operator.js" value={embed.operatorJsUrl} />
      </div>

      <Card className="space-y-3 p-4">
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
        <CopyCard label={`Integration — ${integrationTab}`} value={codePreview} mono />
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">Live preview — operator runtime</span>
          <a
            href={embed.standaloneUrl.replace(/YOUR_OPERATOR_TOKEN|ort_[\w-]+…/g, displayToken)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Открыть <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {displayToken === 'YOUR_OPERATOR_TOKEN' ? (
          <div className="flex h-[360px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Сгенерируйте runtime token для live preview.
          </div>
        ) : (
          <iframe
            title="Operator preview"
            src={embed.runtimeUrl.replace(/YOUR_OPERATOR_TOKEN|ort_[\w-]+…/g, displayToken)}
            className="h-[360px] w-full bg-[#0f1419]"
            allow="camera; microphone; fullscreen; autoplay; display-capture"
          />
        )}
      </Card>

      <OperatorConnectionSteps embed={embed} />
    </div>
  );
}

function OperatorConnectionSteps({ embed }: { embed: OperatorConnectionCenterDto }) {
  return (
    <Card className="space-y-2 p-4">
      <h4 className="font-medium">Инструкция — self-host / white-label</h4>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>Скачайте пакет <code className="text-xs">operator-runtime/</code> из раздела Self-host.</li>
        <li>Разместите на своём домене с HTTPS и настройте nginx reverse proxy к API.</li>
        <li>Укажите <code className="text-xs">BOTME_API_URL</code> и WebSocket endpoint в config.json.</li>
        <li>Вставьте operator.js или iframe с runtime token на страницу операторов.</li>
        <li>
          Standalone:{' '}
          <a className="text-primary hover:underline" href={embed.standaloneUrl} target="_blank" rel="noreferrer">
            {embed.standaloneUrl}
          </a>
        </li>
      </ol>
      <Button variant="secondary" onClick={() => window.open('/operator-runtime/config.json', '_blank')}>
        <RefreshCw className="mr-2 h-3 w-3" /> config.json
      </Button>
    </Card>
  );
}
