import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OperatorEmbedConnectionStatus, OperatorEmbedValidationDto } from '@botme/shared';
import { WS_NAMESPACES } from '@botme/shared';
import { RealtimeRuntimeService } from '../../realtime/services/realtime-runtime.service';
import { OperatorRuntimeTokenService } from './operator-runtime-token.service';

@Injectable()
export class OperatorEmbedValidationService {
  constructor(
    private readonly config: ConfigService,
    private readonly runtime: RealtimeRuntimeService,
    private readonly tokens: OperatorRuntimeTokenService,
  ) {}

  async validate(
    workspaceId: string,
    widgetId: string,
    rtcEnabled: boolean,
    domains: string[],
  ): Promise<OperatorEmbedValidationDto> {
    const checkedAt = new Date().toISOString();
    const embedOrigin = this.config.get<string>('WEB_URL', 'https://agent.neeklo.ru').replace(/\/$/, '');

    const [operatorJsReachable, activeToken, plainToken] = await Promise.all([
      this.checkOperatorJs(embedOrigin),
      this.tokens.getActiveForWidget(workspaceId, widgetId),
      this.tokens.getPlainTokenForAdmin(workspaceId, widgetId),
    ]);

    const opSockets = this.runtime
      .getRuntime()
      .sockets.listByWorkspace(workspaceId)
      .filter((s) => s.namespace === WS_NAMESPACES.operator);

    const tokenValid = Boolean(plainToken && activeToken && !activeToken.revokedAt);
    const websocketReady = this.config.get<string>('FEATURE_REALTIME') !== 'false';
    const rtcAvailable = rtcEnabled && this.config.get<string>('FEATURE_RTC_CALLS') === 'true';
    const domainsConfigured = domains.length > 0;
    const operatorsOnline = opSockets.length;

    let status: OperatorEmbedConnectionStatus = 'offline';
    if (tokenValid && operatorJsReachable && websocketReady) {
      status = operatorsOnline > 0 || (activeToken?.exchangeCount ?? 0) > 0 ? 'connected' : 'partial';
    } else if (tokenValid && (operatorJsReachable || websocketReady)) {
      status = 'partial';
    }

    return {
      status,
      operatorJsReachable,
      tokenValid,
      websocketReady,
      rtcAvailable,
      operatorsOnline,
      tokenExpiresAt: activeToken?.expiresAt ?? null,
      tokenLastUsedAt: activeToken?.lastUsedAt ?? null,
      tokenExchangeCount: activeToken?.exchangeCount ?? 0,
      domainsConfigured,
      checkedAt,
    };
  }

  private async checkOperatorJs(embedOrigin: string): Promise<boolean> {
    try {
      const res = await fetch(`${embedOrigin}/operator.js`, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }
}
