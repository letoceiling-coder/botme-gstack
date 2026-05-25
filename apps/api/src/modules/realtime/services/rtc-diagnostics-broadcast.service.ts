import { Injectable, Logger } from '@nestjs/common';
import { RealtimeDiagnosticsService } from './realtime-diagnostics.service';
import { AdminSocketBridge } from './admin-socket-bridge.service';

/** Push RTC diagnostics to admin workspace room — no polling. */
@Injectable()
export class RtcDiagnosticsBroadcastService {
  private readonly logger = new Logger(RtcDiagnosticsBroadcastService.name);
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly diagnostics: RealtimeDiagnosticsService,
    private readonly adminBridge: AdminSocketBridge,
  ) {}

  scheduleBroadcast(workspaceId: string, delayMs = 250): void {
    const existing = this.debounceTimers.get(workspaceId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(workspaceId);
      void this.broadcastNow(workspaceId);
    }, delayMs);
    this.debounceTimers.set(workspaceId, timer);
  }

  async broadcastNow(workspaceId: string): Promise<void> {
    try {
      const payload = await this.diagnostics.getRtcDiagnostics(workspaceId);
      this.adminBridge.emitRtcDiagnostics(workspaceId, payload);
    } catch (err: unknown) {
      this.logger.warn(`RTC diagnostics broadcast failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
