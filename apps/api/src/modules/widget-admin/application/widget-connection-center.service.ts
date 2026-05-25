import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WidgetConnectionCenterDto } from '@botme/shared';
import { WidgetAdminRepository, toWidgetDetailDto } from '../infrastructure/widget-admin.repository';
import { WidgetConnectionHealthService } from './widget-connection-health.service';

@Injectable()
export class WidgetConnectionCenterService {
  constructor(
    private readonly widgets: WidgetAdminRepository,
    private readonly health: WidgetConnectionHealthService,
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
        websocketUrl: `${wsOrigin}/socket.io`,
        widgetJsUrl: `${embedOrigin}/widget.js`,
      },
      selfHost: {
        widgetJsUrl: `${embedOrigin}/widget.js`,
        websocketUrl: `${wsOrigin}/socket.io`,
        rtcSignalingPath: '/socket.io (namespaces: /widget, /operator)',
        turnHost,
        turnUdp: `turn:${turnHost}:3478?transport=udp`,
        turnTcp: `turn:${turnHost}:3478?transport=tcp`,
        permissionsPolicyExample:
          'Permissions-Policy: camera=(self), microphone=(self), display-capture=(self)',
        nginxSnippet: `location /widget.js {
  alias /var/www/agent.neeklo.ru/widget/widget.js;
  add_header Cache-Control "public, max-age=60";
}
location /socket.io/ {
  proxy_pass http://127.0.0.1:3110;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 86400;
}`,
        cspExample: `script-src 'self' ${embedOrigin}; connect-src 'self' ${embedOrigin} wss://${new URL(embedOrigin).host};`,
      },
      health,
      embedCode: detail.embedCode,
      installSteps: [
        'Скопируйте embed-код и вставьте перед </body> на вашем сайте.',
        `Добавьте домен сайта в список разрешённых: ${detail.domains.join(', ') || 'не заданы'}.`,
        'Убедитесь, что WebSocket и widget.js доступны с вашего домена (HTTPS обязателен).',
        'Откройте панель оператора, войдите в workspace и примите чат.',
        'Для видеозвонков разрешите камеру и микрофон в браузере.',
      ],
    };
  }
}
