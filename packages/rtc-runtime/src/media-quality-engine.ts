import type { RtcDiagnosticsSnapshot } from './types.js';

export type QualityAction =
  | 'none'
  | 'lower-bitrate'
  | 'lower-resolution'
  | 'disable-hd'
  | 'audio-only'
  | 'ice-restart'
  | 'turn-only-retry';

export interface QualityEngineConfig {
  rttDegradeMs?: number;
  packetLossDegradePct?: number;
  packetLossAudioOnlyPct?: number;
}

const DEFAULTS: Required<QualityEngineConfig> = {
  rttDegradeMs: 600,
  packetLossDegradePct: 8,
  packetLossAudioOnlyPct: 20,
};

/** Adaptive media decisions from diagnostics snapshots. */
export class MediaQualityEngine {
  private readonly cfg: Required<QualityEngineConfig>;
  private turnOnlyMode = false;
  private hdDisabled = false;

  constructor(config: QualityEngineConfig = {}) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  isTurnOnlyMode(): boolean {
    return this.turnOnlyMode;
  }

  isHdDisabled(): boolean {
    return this.hdDisabled;
  }

  decide(snapshot: RtcDiagnosticsSnapshot): QualityAction {
    if (snapshot.iceState === 'failed') return 'ice-restart';
    if (snapshot.packetLossPct !== null && snapshot.packetLossPct > this.cfg.packetLossAudioOnlyPct) {
      return 'audio-only';
    }
    if (snapshot.rttMs !== null && snapshot.rttMs > this.cfg.rttDegradeMs * 2 && !this.turnOnlyMode) {
      return 'turn-only-retry';
    }
    if (snapshot.packetLossPct !== null && snapshot.packetLossPct > this.cfg.packetLossDegradePct) {
      return this.hdDisabled ? 'lower-bitrate' : 'disable-hd';
    }
    if (snapshot.rttMs !== null && snapshot.rttMs > this.cfg.rttDegradeMs) {
      return 'lower-resolution';
    }
    return 'none';
  }

  applyAction(action: QualityAction): void {
    if (action === 'disable-hd') this.hdDisabled = true;
    if (action === 'turn-only-retry') this.turnOnlyMode = true;
  }

  reset(): void {
    this.turnOnlyMode = false;
    this.hdDisabled = false;
  }
}
