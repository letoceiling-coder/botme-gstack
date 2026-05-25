import { Injectable, NotFoundException } from '@nestjs/common';
import type { WidgetPublicInitDto } from '@botme/shared';
import { normalizeLauncherConfig } from '@botme/shared';
import { WidgetAuthService } from '../../foundation/application/widget-auth.service';
import { WidgetRepository } from '../../foundation/infrastructure/widget.repository';

@Injectable()
export class WidgetPublicService {
  constructor(
    private readonly widgetAuth: WidgetAuthService,
    private readonly widgets: WidgetRepository,
  ) {}

  async getInit(
    publicKey: string,
    origin: string | undefined,
    referer?: string,
  ): Promise<WidgetPublicInitDto> {
    await this.widgetAuth.authenticate(publicKey, origin, { referer });
    const widget = await this.widgets.findActiveByPublicKey(publicKey);
    if (!widget) throw new NotFoundException('Виджет не найден');

    const widgetOrigin =
      process.env['WIDGET_PUBLIC_ORIGIN']?.replace(/\/$/, '') ?? 'https://agent.neeklo.ru';

    const theme = normalizeLauncherConfig(widget.launcherConfig);
    if (theme.welcomeMessage == null && widget.assistant.welcomeMessage) {
      theme.welcomeMessage = widget.assistant.welcomeMessage;
    }
    if (theme.widgetTitle == null) {
      theme.widgetTitle = widget.assistant.name;
    }
    if (theme.avatarUrl == null && widget.assistant.avatarUrl) {
      theme.avatarUrl = widget.assistant.avatarUrl;
    }

    return {
      publicKey: widget.publicKey,
      widgetOrigin,
      embedPath: '/widget/',
      theme,
      assistant: {
        name: widget.assistant.name,
        welcomeMessage: widget.assistant.welcomeMessage,
      },
    };
  }
}
