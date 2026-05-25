import { Injectable, UnauthorizedException } from '@nestjs/common';
import { WidgetRepository } from '../infrastructure/widget.repository';
import { WidgetPreviewTokenService } from './widget-preview-token.service';

/** Resolved widget session — assistantId comes from DB only, never from client. */
export interface WidgetSessionContext {
  widgetId: string;
  workspaceId: string;
  assistantId: string;
  publicKey: string;
  previewMode?: boolean;
}

@Injectable()
export class WidgetAuthService {
  constructor(
    private readonly widgets: WidgetRepository,
    private readonly previewTokens: WidgetPreviewTokenService,
  ) {}

  async authenticate(
    publicKey: string,
    origin: string | undefined,
    options?: { previewToken?: string; referer?: string },
  ): Promise<WidgetSessionContext> {
    const trimmedKey = publicKey.trim();
    if (!trimmedKey) {
      throw new UnauthorizedException('widgetKey обязателен');
    }

    const widget = await this.widgets.findActiveByPublicKey(trimmedKey);
    if (!widget) {
      throw new UnauthorizedException('Виджет не найден или отключён');
    }

    this.assertAssistantWorkspaceMatch(widget.workspaceId, widget.assistant.workspaceId);

    let previewMode = false;
    if (options?.previewToken) {
      const verified = this.previewTokens.verify(options.previewToken, trimmedKey, origin);
      if (verified.widgetId !== widget.id || verified.workspaceId !== widget.workspaceId) {
        throw new UnauthorizedException('Preview token недействителен');
      }
      previewMode = true;
    } else {
      const clientOrigin = this.resolveClientOrigin(origin, options?.referer);
      this.assertDomainAllowlist(widget.domains, clientOrigin);
    }

    return {
      widgetId: widget.id,
      workspaceId: widget.workspaceId,
      assistantId: widget.assistantId,
      publicKey: widget.publicKey,
      previewMode,
    };
  }

  private assertAssistantWorkspaceMatch(
    widgetWorkspaceId: string,
    assistantWorkspaceId: string,
  ): void {
    if (widgetWorkspaceId !== assistantWorkspaceId) {
      throw new UnauthorizedException('Конфигурация виджета недействительна');
    }
  }

  private resolveClientOrigin(origin: string | undefined, referer: string | undefined): string | undefined {
    if (origin?.trim()) return origin.trim();
    if (!referer?.trim()) return undefined;
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }

  private assertDomainAllowlist(
    domains: Array<{ domain: string }>,
    origin: string | undefined,
  ): void {
    if (domains.length === 0) {
      throw new UnauthorizedException('Домены виджета не настроены');
    }

    if (!origin) {
      throw new UnauthorizedException('Origin обязателен');
    }

    const hostname = this.parseOriginHostname(origin);
    if (!hostname) {
      throw new UnauthorizedException('Некорректный origin');
    }

    const widgetHost = this.parseOriginHostname(
      process.env['WIDGET_PUBLIC_ORIGIN']?.replace(/\/$/, '') ?? 'https://agent.neeklo.ru',
    );
    if (widgetHost && hostname === widgetHost) {
      return;
    }

    const allowed = domains.some((d) => d.domain.toLowerCase() === hostname);
    if (!allowed) {
      throw new UnauthorizedException('Origin не разрешён для этого виджета');
    }
  }

  private parseOriginHostname(origin: string): string | null {
    try {
      return new URL(origin).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}
