import type { RtcDiagnosticsSnapshot } from './types.js';

export type NetworkQualityLevel = 'excellent' | 'good' | 'unstable' | 'poor' | 'disconnected';

export interface QualityThresholds {
  excellentRttMs: number;
  goodRttMs: number;
  unstableRttMs: number;
  excellentLossPct: number;
  goodLossPct: number;
  unstableLossPct: number;
}

const DEFAULT_THRESHOLDS: QualityThresholds = {
  excellentRttMs: 150,
  goodRttMs: 350,
  unstableRttMs: 600,
  excellentLossPct: 2,
  goodLossPct: 5,
  unstableLossPct: 12,
};

/** Maps WebRTC stats snapshot → production quality tier. */
export function classifyNetworkQuality(
  snapshot: RtcDiagnosticsSnapshot,
  thresholds: QualityThresholds = DEFAULT_THRESHOLDS,
): NetworkQualityLevel {
  if (
    snapshot.iceState === 'failed' ||
    snapshot.iceState === 'closed' ||
    snapshot.connectionState === 'failed' ||
    snapshot.connectionState === 'closed'
  ) {
    return 'disconnected';
  }
  // ICE still negotiating — do not show "excellent" before media path exists.
  if (snapshot.iceState === 'new' || snapshot.iceState === 'checking') {
    return 'unstable';
  }
  if (snapshot.iceState === 'disconnected' || snapshot.mediaFrozen) {
    return 'poor';
  }

  const rtt = snapshot.rttMs ?? 0;
  const loss = snapshot.packetLossPct ?? 0;

  if (loss > thresholds.unstableLossPct || rtt > thresholds.unstableRttMs) return 'poor';
  if (loss > thresholds.goodLossPct || rtt > thresholds.goodRttMs) return 'unstable';
  if (loss > thresholds.excellentLossPct || rtt > thresholds.excellentRttMs) return 'good';
  return 'excellent';
}

export const QUALITY_LABELS_RU: Record<NetworkQualityLevel, string> = {
  excellent: 'Отличное соединение',
  good: 'Хорошее соединение',
  unstable: 'Связь нестабильна',
  poor: 'Плохое соединение',
  disconnected: 'Нет соединения',
};

export const RECOVERY_LABELS_RU = {
  reconnecting: 'Переподключение…',
  recovering: 'Восстановление соединения…',
  recovered: 'Соединение восстановлено',
  iceRestart: 'Обновление канала связи…',
} as const;
