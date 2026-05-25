import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OperatorConnectionCenterDto, WidgetConnectionCenterDto } from '@botme/shared';
import { WidgetAdminRepository, toWidgetDetailDto } from '../infrastructure/widget-admin.repository';
import { WidgetConnectionHealthService } from './widget-connection-health.service';
import { OperatorRuntimeTokenService } from './operator-runtime-token.service';

@Injectable()
export class WidgetConnectionCenterService {
  constructor(
    private readonly widgets: WidgetAdminRepository,
    private readonly health: WidgetConnectionHealthService,
    private readonly runtimeTokens: OperatorRuntimeTokenService,
    private readonly config: ConfigService,
  ) {}

  async getConnectionCenter(workspaceId: string, widgetId: string): Promise<WidgetConnectionCenterDto> {
    const row = await this.widgets.findById(workspaceId, widgetId);
    if (!row) throw new NotFoundException('Виджет не найден');

    const embedOrigin = this.config.get<string>('WEB_URL', 'https://agent.neeklo.ru').replace(/\/$/, '');
    const demoOrigin = this.config.get<string>('DEMO_URL', 'https://demo.neeklo.ru').replace(/\/$/, '');
    const turnHost = this.config.get<string>('TURN_HOST', 'turn.neeklo.ru');
    const wsOrigin = embedOrigin.replace(/^http/, 'ws');
    const detail = toWidgetDetailDto(row, embedOrigin);
    const workspace = await this.widgets.getWorkspace(workspaceId);
    const health = await this.health.check(workspaceId, widgetId, row.assistantId);
    const activeToken = await this.runtimeTokens.getActiveForWidget(workspaceId, widgetId);
    const tokenPlaceholder = activeToken ? `${activeToken.tokenPrefix}…` : 'YOUR_OPERATOR_TOKEN';
    const operatorEmbed = this.buildOperatorEmbed(
      embedOrigin,
      demoOrigin,
      workspaceId,
      row.domains.map((d) => d.domain),
      tokenPlaceholder,
      activeToken,
    );

    return {
      access: {
        workspaceId,
        workspaceName: workspace?.name ?? 'Workspace',
        workspaceSlug: workspace?.slug ?? '',
        widgetId: row.id,
        widgetName: row.name,
        assistantId: row.assistantId,
        assistantName: row.assistant.name,
        isActive: row.isActive,
        rtcEnabled: this.config.get<string>('FEATURE_RTC_CALLS') === 'true',
        domains: row.domains.map((d) => d.domain),
      },
      operatorUrls: {
        adminOperatorUrl: `${embedOrigin}/admin/operator`,
        operatorPanelUrl: `${demoOrigin}/operator`,
        operatorEmbedPath: '/operator-panel/',
        operatorJsUrl: `${embedOrigin}/operator.js`,
        operatorRuntimeUrl: `${embedOrigin}/operator-runtime/`,
        standaloneOperatorUrl: `${embedOrigin}/operator-runtime/?workspace=${workspaceId}&token=${tokenPlaceholder}`,
        websocketUrl: `${wsOrigin}/socket.io`,
        widgetJsUrl: `${embedOrigin}/widget.js`,
      },
      operatorEmbed,
      selfHost: {
        widgetJsUrl: `${embedOrigin}/widget.js`,
        operatorJsUrl: `${embedOrigin}/operator.js`,
        operatorRuntimePackagePath: '/operator-runtime/',
        websocketUrl: `${wsOrigin}/socket.io`,
        rtcSignalingPath: '/socket.io (namespaces: /widget, /operator)',
        turnHost,
        turnUdp: `turn:${turnHost}:3478?transport=udp`,
        turnTcp: `turn:${turnHost}:3478?transport=tcp`,
        permissionsPolicyExample:
          'Permissions-Policy: camera=(self), microphone=(self), display-capture=(self), fullscreen=(self)',
        nginxSnippet: `location /widget.js {
  alias /var/www/agent.neeklo.ru/apps/widget/dist/widget.js;
  add_header Cache-Control "public, max-age=60";
}
location /socket.io/ {
  proxy_pass http://127.0.0.1:3110;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 86400;
}`,
        operatorNginxSnippet: `location = /operator.js {
  alias /var/www/agent.neeklo.ru/apps/operator-panel/dist/operator.js;
  add_header Cache-Control "public, max-age=60";
  add_header Access-Control-Allow-Origin *;
}
location /operator-runtime/ {
  alias /var/www/agent.neeklo.ru/apps/operator-panel/dist/;
  index index.html;
  add_header Permissions-Policy "camera=*, microphone=*, autoplay=*, fullscreen=*, display-capture=*" always;
}`,
        cspExample: `script-src 'self' ${embedOrigin}; connect-src 'self' ${embedOrigin} wss://${new URL(embedOrigin).host};`,
      },
      health,
      embedCode: detail.embedCode,
      installSteps: [
        'Скопируйте embed-код виджета и вставьте перед </body> на вашем сайте.',
        `Добавьте домен сайта в список разрешённых: ${detail.domains.join(', ') || 'не заданы'}.`,
        'Сгенерируйте operator runtime token в разделе «Подключение кабинета оператора».',
        'Вставьте operator.js или iframe на страницу операторов.',
        'Убедитесь, что WebSocket доступен (HTTPS обязателен).',
        'Для видеозвонков разрешите камеру и микрофон в браузере.',
      ],
    };
  }

  private buildOperatorEmbed(
    embedOrigin: string,
    demoOrigin: string,
    workspaceId: string,
    widgetDomains: string[],
    tokenPlaceholder: string,
    activeToken: import('@botme/shared').OperatorRuntimeTokenDto | null,
  ): OperatorConnectionCenterDto {
    const operatorJsUrl = `${embedOrigin}/operator.js`;
    const runtimeBase = `${embedOrigin}/operator-runtime/`;
    const standaloneUrl = `${runtimeBase}?workspace=${encodeURIComponent(workspaceId)}&token=${encodeURIComponent(tokenPlaceholder)}`;
    const runtimeUrl = `${runtimeBase}?token=${encodeURIComponent(tokenPlaceholder)}`;

    const scriptEmbedCode = `<script
  src="${operatorJsUrl}"
  data-workspace="${workspaceId}"
  data-operator-token="${tokenPlaceholder}"
  data-theme="dark"
  data-position="fullscreen"
></script>`;

    const iframeEmbedCode = `<iframe
  src="${runtimeUrl}"
  allow="camera; microphone; fullscreen; autoplay; display-capture"
  style="width:100%;height:100dvh;border:none;background:#0f1419"
  title="Operator panel"
></iframe>`;

    const integrations = [
      { id: 'html-script', label: 'HTML — script embed', language: 'html', code: scriptEmbedCode },
      { id: 'html-iframe', label: 'HTML — iframe', language: 'html', code: iframeEmbedCode },
      {
        id: 'react',
        label: 'React',
        language: 'tsx',
        code: `useEffect(() => {
  const s = document.createElement('script');
  s.src = '${operatorJsUrl}';
  s.dataset.workspace = '${workspaceId}';
  s.dataset.operatorToken = '${tokenPlaceholder}';
  s.dataset.theme = 'dark';
  s.dataset.position = 'fullscreen';
  document.body.appendChild(s);
  return () => { s.remove(); };
}, []);`,
      },
      {
        id: 'vue',
        label: 'Vue 3',
        language: 'vue',
        code: `<script setup>
import { onMounted, onUnmounted } from 'vue';

onMounted(() => {
  const s = document.createElement('script');
  s.src = '${operatorJsUrl}';
  s.dataset.workspace = '${workspaceId}';
  s.dataset.operatorToken = '${tokenPlaceholder}';
  s.dataset.theme = 'dark';
  s.dataset.position = 'fullscreen';
  document.body.appendChild(s);
  onUnmounted(() => s.remove());
});
<\/script>`,
      },
      {
        id: 'nuxt',
        label: 'Nuxt 3',
        language: 'vue',
        code: `<script setup lang="ts">
useHead({
  script: [{
    src: '${operatorJsUrl}',
    'data-workspace': '${workspaceId}',
    'data-operator-token': '${tokenPlaceholder}',
    'data-theme': 'dark',
    'data-position': 'fullscreen',
  }],
});
<\/script>`,
      },
      {
        id: 'next',
        label: 'Next.js',
        language: 'tsx',
        code: `import Script from 'next/script';

export default function OperatorPage() {
  return (
    <Script
      src="${operatorJsUrl}"
      data-workspace="${workspaceId}"
      data-operator-token="${tokenPlaceholder}"
      data-theme="dark"
      data-position="fullscreen"
      strategy="afterInteractive"
    />
  );
}`,
      },
    ];

    return {
      standaloneUrl,
      runtimeUrl,
      operatorJsUrl,
      iframeEmbedCode,
      scriptEmbedCode,
      integrations,
      activeToken,
      allowedDomains: activeToken?.allowedDomains.length
        ? activeToken.allowedDomains
        : widgetDomains,
    };
  }
}
