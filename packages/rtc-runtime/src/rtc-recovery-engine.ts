import { MediaQualityEngine, type QualityAction } from './media-quality-engine.js';
import { classifyNetworkQuality, type NetworkQualityLevel } from './network-quality.js';
import type { RtcDiagnosticsSnapshot } from './types.js';

export interface RecoveryEngineCallbacks {
  onQualityChange?: (level: NetworkQualityLevel, snapshot: RtcDiagnosticsSnapshot) => void;
  onRecoveryAction?: (action: QualityAction) => void;
  onMediaStall?: () => void;
  onIceRestart?: () => void | Promise<void>;
}

/** Self-healing layer: quality tiers, adaptive actions, ICE restart orchestration. */
export class RtcRecoveryEngine {
  private readonly quality = new MediaQualityEngine();
  private lastLevel: NetworkQualityLevel = 'excellent';
  private recovering = false;
  private renegotiateLock = false;
  private callbacks: RecoveryEngineCallbacks = {};

  setCallbacks(cb: RecoveryEngineCallbacks): void {
    this.callbacks = cb;
  }

  isRenegotiating(): boolean {
    return this.renegotiateLock;
  }

  async withRenegotiationLock<T>(fn: () => Promise<T>): Promise<T | null> {
    if (this.renegotiateLock) return null;
    this.renegotiateLock = true;
    try {
      return await fn();
    } finally {
      this.renegotiateLock = false;
    }
  }

  handleDiagnostics(snapshot: RtcDiagnosticsSnapshot): void {
    const level = classifyNetworkQuality(snapshot);
    if (level !== this.lastLevel) {
      this.lastLevel = level;
      this.callbacks.onQualityChange?.(level, snapshot);
    }

    const action = this.quality.decide(snapshot);
    if (action === 'none') {
      if (this.recovering && level === 'excellent' || level === 'good') {
        this.recovering = false;
      }
      return;
    }

    this.callbacks.onRecoveryAction?.(action);
    this.quality.applyAction(action);

    if (action === 'ice-restart' || action === 'turn-only-retry') {
      this.recovering = true;
      void this.callbacks.onIceRestart?.();
    }
  }

  handleMediaStall(): void {
    this.recovering = true;
    this.callbacks.onMediaStall?.();
    void this.callbacks.onIceRestart?.();
  }

  reset(): void {
    this.quality.reset();
    this.lastLevel = 'excellent';
    this.recovering = false;
    this.renegotiateLock = false;
  }
}
