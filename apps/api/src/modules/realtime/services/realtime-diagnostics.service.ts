import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RealtimeDiagnosticsDto, RtcDiagnosticsExtendedDto } from '@botme/shared';
import { RealtimeRuntimeService } from './realtime-runtime.service';
import { LiveVisitorTrackerService } from './live-visitor-tracker.service';
import { ActiveCallRegistryService } from './active-call-registry.service';
import { WebRtcSignalService } from './webrtc-signal.service';
import { WidgetStreamRegistry } from '../../widget-chat/application/widget-stream-registry';
import { StreamRegistry } from '../../playground/application/stream-registry';

@Injectable()
export class RealtimeDiagnosticsService {
  constructor(
    private readonly config: ConfigService,
    private readonly runtime: RealtimeRuntimeService,
    private readonly visitors: LiveVisitorTrackerService,
    private readonly callRegistry: ActiveCallRegistryService,
    private readonly webrtc: WebRtcSignalService,
    private readonly widgetStreams: WidgetStreamRegistry,
    private readonly playgroundStreams: StreamRegistry,
  ) {}

  async getDiagnostics(workspaceId: string): Promise<RealtimeDiagnosticsDto> {
    const rt = this.runtime.getRuntime();
    const diag = rt.getDiagnostics();
    const staleSessions = rt.sockets.listStale().length;

    return {
      socketCount: diag.socketCount,
      widgetSockets: rt.sockets.countByNamespace('/widget'),
      operatorSockets: rt.sockets.countByNamespace('/operator'),
      adminSockets: rt.sockets.countByNamespace('/admin'),
      dedupeCacheSize: diag.dedupeCacheSize,
      activeStreams: this.widgetStreams.count() + this.playgroundStreams.count(),
      staleSessions,
      reconnectRate: 0,
      redisAdapter: true,
      turnFeatureEnabled: this.webrtc.isEnabled(),
    };
  }

  async getRtcDiagnostics(workspaceId: string): Promise<RtcDiagnosticsExtendedDto> {
    const base = await this.getDiagnostics(workspaceId);
    const activeCalls = await this.callRegistry.listActive(workspaceId);
    return {
      ...base,
      activeCalls,
      activeCallCount: activeCalls.length,
      turnHost: this.config.get<string>('TURN_HOST', 'turn.neeklo.ru') ?? null,
      signalRelayEnabled: this.webrtc.isEnabled(),
    };
  }
}
