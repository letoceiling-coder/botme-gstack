import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OperatorConnectionCenterDto, OperatorProvisionResultDto, WidgetConnectionCenterDto } from '@botme/shared';
import { WidgetAdminRepository, toWidgetDetailDto } from '../infrastructure/widget-admin.repository';
import { WidgetConnectionHealthService } from './widget-connection-health.service';
import { OperatorRuntimeTokenService } from './operator-runtime-token.service';
import { OperatorEmbedValidationService } from './operator-embed-validation.service';

@Injectable()
export class WidgetConnectionCenterService {
  constructor(
    private readonly widgets: WidgetAdminRepository,
    private readonly health: WidgetConnectionHealthService,
    private readonly runtimeTokens: OperatorRuntimeTokenService,
    private readonly embedValidation: OperatorEmbedValidationService,
    private readonly config: ConfigService,
  ) {}

  async getConnectionCenter(
    workspaceId: string,
    widgetId: string,
    userId: string,
  ): Promise<WidgetConnectionCenterDto> {
    const row = await this.widgets.findById(workspaceId, widgetId);
    if (!row) throw new NotFoundException('Виджет не найден');

    const domains = row.domains.map((d) => d.domain);
    const { plainToken, dto: activeToken } = await this.runtimeTokens.ensureDefaultToken(
      workspaceId,
      widgetId,
      userId,
      domains,
    );

    return this.buildCenter(workspaceId, widgetId, userId, row, plainToken, activeToken);
  }

  async provisionOperatorConnection(
    workspaceId: string,
    widgetId: string,
    userId: string,
  ): Promise<OperatorProvisionResultDto> {
    const row = await this.widgets.findById(workspaceId, widgetId);
    if (!row) throw new NotFoundException('Виджет не найден');

    const domains = row.domains.map((d) => d.domain);
    const { plainToken, dto: activeToken } = await this.runtimeTokens.regenerate(
      workspaceId,
      widgetId,
      userId,
    );

    const center = await this.buildCenter(workspaceId, widgetId, userId, row, plainToken, activeToken);
    return { ok: true, operatorEmbed: center.operatorEmbed };
  }

  async getOperatorValidation(workspaceId: string, widgetId: string) {
    const row = await this.widgets.findById(workspaceId, widgetId);
    if (!row) throw new NotFoundException('Виджет не найден');
    const rtcEnabled = this.config.get<string>('FEATURE_RTC_CALLS') === 'true';
    return this.embedValidation.validate(
      workspaceId,
      widgetId,
      rtcEnabled,
      row.domains.map((d) => d.domain),
    );
  }

  private async buildCenter(
    workspaceId: string,
    widgetId: string,
    userId: string,
    row: NonNullable<Awaited<ReturnType<WidgetAdminRepository['findById']>>>,
    plainToken: string,
    activeToken: import('@botme/shared').OperatorRuntimeTokenDto,
  ): Promise<WidgetConnectionCenterDto> {
    const embedOrigin = this.config.get<string>('WEB_URL', 'https://agent.neeklo.ru').replace(/\/$/, '');
    const demoOrigin = this.config.get<string>('DEMO_URL', 'https://demo.neeklo.ru').replace(/\/$/, '');
    const turnHost = this.config.get<string>('TURN_HOST', 'turn.neeklo.ru');
    const wsOrigin = embedOrigin.replace(/^http/, 'ws');
    const detail = toWidgetDetailDto(row, embedOrigin);
    const workspace = await this.widgets.getWorkspace(workspaceId);
    const health = await this.health.check(workspaceId, widgetId, row.assistantId);
    const rtcEnabled = this.config.get<string>('FEATURE_RTC_CALLS') === 'true';
    const domains = row.domains.map((d) => d.domain);

    const validation = await this.embedValidation.validate(workspaceId, widgetId, rtcEnabled, domains);
    const operatorEmbed = this.buildOperatorEmbed(embedOrigin, workspaceId, domains, plainToken, activeToken, validation);

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
        rtcEnabled,
        domains,
      },
      operatorUrls: {
        adminOperatorUrl: `${embedOrigin}/admin/operator`,
        operatorPanelUrl: `${demoOrigin}/operator`,
        operatorEmbedPath: '/operator-panel/',
        operatorJsUrl: `${embedOrigin}/operator.js`,
        operatorRuntimeUrl: `${embedOrigin}/operator-runtime/`,
        standaloneOperatorUrl: operatorEmbed.standaloneUrl,
        websocketUrl: `${wsOrigin}/socket.io`,
        widgetJsUrl: `${embedOrigin}/widget.js`,
      },
      operatorEmbed,
      selfHost: {
        widgetJsUrl: `${embedOrigin}/widget.js`,
        operatorJsUrl: `${embedOrigin}/operator.js`,
        operatorRuntimePackagePath: '/api/widgets/' + widgetId + '/operator-self-host.zip',
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
        'Скопируйте embed-код виджета — он уже готов, вставьте перед </body>.',
        'Скопируйте embed-код оператора из вкладки «Кабинет оператора» — тоже готов к вставке.',
        `Разрешённые домены: ${domains.join(', ') || 'не заданы'}.`,
        'Готово — операторы могут работать без дополнительной настройки.',
      ],
    };
  }

  private buildOperatorEmbed(
    embedOrigin: string,
    workspaceId: string,
    widgetDomains: string[],
    plainToken: string,
    activeToken: import('@botme/shared').OperatorRuntimeTokenDto,
    validation: import('@botme/shared').OperatorEmbedValidationDto,
  ): OperatorConnectionCenterDto {
    const operatorJsUrl = `${embedOrigin}/operator.js`;
    const runtimeBase = `${embedOrigin}/operator-runtime/`;
    const standaloneUrl = `${runtimeBase}?workspace=${encodeURIComponent(workspaceId)}&token=${encodeURIComponent(plainToken)}`;
    const runtimeUrl = `${runtimeBase}?token=${encodeURIComponent(plainToken)}&workspace=${encodeURIComponent(workspaceId)}&theme=dark`;

    const scriptEmbedCode = `<script
  src="${operatorJsUrl}"
  data-workspace="${workspaceId}"
  data-operator-token="${plainToken}"
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
      {
        id: 'html-script',
        label: 'HTML — script',
        language: 'html',
        difficulty: 'easy' as const,
        setupMinutes: 1,
        code: scriptEmbedCode,
      },
      {
        id: 'html-iframe',
        label: 'HTML — iframe',
        language: 'html',
        difficulty: 'easy' as const,
        setupMinutes: 1,
        code: iframeEmbedCode,
      },
      {
        id: 'react',
        label: 'React',
        language: 'tsx',
        difficulty: 'medium' as const,
        setupMinutes: 2,
        code: `useEffect(() => {
  const script = document.createElement('script');
  script.src = '${operatorJsUrl}';
  script.dataset.workspace = '${workspaceId}';
  script.dataset.operatorToken = '${plainToken}';
  script.dataset.theme = 'dark';
  script.dataset.position = 'fullscreen';
  document.body.appendChild(script);
  return () => {
    document.body.removeChild(script);
  };
}, []);`,
      },
      {
        id: 'vue',
        label: 'Vue 3',
        language: 'vue',
        difficulty: 'medium' as const,
        setupMinutes: 2,
        code: `<script setup>
import { onMounted, onUnmounted } from 'vue';

onMounted(() => {
  const script = document.createElement('script');
  script.src = '${operatorJsUrl}';
  script.dataset.workspace = '${workspaceId}';
  script.dataset.operatorToken = '${plainToken}';
  script.dataset.theme = 'dark';
  script.dataset.position = 'fullscreen';
  document.body.appendChild(script);
  onUnmounted(() => script.remove());
});
<\/script>`,
      },
      {
        id: 'nuxt',
        label: 'Nuxt 3',
        language: 'vue',
        difficulty: 'medium' as const,
        setupMinutes: 3,
        code: `<script setup lang="ts">
useHead({
  script: [{
    src: '${operatorJsUrl}',
    'data-workspace': '${workspaceId}',
    'data-operator-token': '${plainToken}',
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
        difficulty: 'medium' as const,
        setupMinutes: 3,
        code: `import Script from 'next/script';

export default function OperatorPage() {
  return (
    <Script
      src="${operatorJsUrl}"
      data-workspace="${workspaceId}"
      data-operator-token="${plainToken}"
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
      allowedDomains: activeToken.allowedDomains.length ? activeToken.allowedDomains : widgetDomains,
      connectionReady: validation.tokenValid && validation.operatorJsReachable,
      validation,
    };
  }
}
