import type { RtcDiagnosticsSnapshot } from './types.js';

/** Collects WebRTC stats for adaptive quality and observability. */
export class RTCDiagnosticsCollector {
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastOutboundBytes = 0;
  private lastInboundBytes = 0;
  private lastInboundFps = 0;
  private lastInboundAt = 0;
  private lastTimestamp = 0;
  private reconnectCount = 0;
  private snapshot: RtcDiagnosticsSnapshot = emptySnapshot();

  get lastSnapshot(): RtcDiagnosticsSnapshot {
    return this.snapshot;
  }

  setReconnectCount(count: number): void {
    this.reconnectCount = count;
  }

  start(pc: RTCPeerConnection, onUpdate: (s: RtcDiagnosticsSnapshot) => void, intervalMs = 3000): void {
    this.stop();
    this.interval = setInterval(() => {
      void this.collect(pc).then((s) => {
        this.snapshot = s;
        onUpdate(s);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.lastOutboundBytes = 0;
    this.lastInboundBytes = 0;
    this.lastInboundFps = 0;
    this.lastInboundAt = 0;
    this.lastTimestamp = 0;
    this.snapshot = emptySnapshot();
  }

  async collect(pc: RTCPeerConnection): Promise<RtcDiagnosticsSnapshot> {
    const stats = await pc.getStats();
    let rttMs: number | null = null;
    let packetLossPct: number | null = null;
    let jitterMs: number | null = null;
    let bitrateKbps: number | null = null;
    let usingTurn = false;
    let codec: string | null = null;
    let fps: number | null = null;
    let inboundFps: number | null = null;
    let outboundFps: number | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let audioLevel: number | null = null;
    let candidateType: string | null = null;
    let transportType: string | null = null;
    let inboundBytes = 0;

    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        rttMs = typeof report.currentRoundTripTime === 'number'
          ? Math.round(report.currentRoundTripTime * 1000)
          : rttMs;
        const localId = report.localCandidateId;
        if (typeof localId === 'string') {
          stats.forEach((local) => {
            if (local.id === localId && local.type === 'local-candidate' && typeof local.candidateType === 'string') {
              candidateType = local.candidateType;
            }
          });
        }
      }
      if (report.type === 'remote-inbound-rtp') {
        if (typeof report.packetsLost === 'number' && typeof report.packetsReceived === 'number') {
          const total = report.packetsLost + report.packetsReceived;
          packetLossPct = total > 0 ? Math.round((report.packetsLost / total) * 1000) / 10 : 0;
        }
        if (typeof report.jitter === 'number') {
          jitterMs = Math.round(report.jitter * 1000);
        }
      }
      if (report.type === 'inbound-rtp') {
        inboundBytes += report.bytesReceived ?? 0;
        if (report.kind === 'video') {
          inboundFps = report.framesPerSecond ?? inboundFps;
        }
        if (report.kind === 'audio' && typeof report.audioLevel === 'number') {
          audioLevel = report.audioLevel;
        }
      }
      if (report.type === 'outbound-rtp') {
        const now = report.timestamp;
        const bytes = report.bytesSent ?? 0;
        if (this.lastTimestamp && now > this.lastTimestamp) {
          const kbps = ((bytes - this.lastOutboundBytes) * 8) / (now - this.lastTimestamp);
          bitrateKbps = Math.round(kbps);
        }
        this.lastOutboundBytes = bytes;
        this.lastTimestamp = now;
        if (report.kind === 'video') {
          fps = report.framesPerSecond ?? fps;
          outboundFps = report.framesPerSecond ?? outboundFps;
          width = report.frameWidth ?? width;
          height = report.frameHeight ?? height;
        }
        if (typeof report.codecId === 'string') codec = report.codecId;
      }
      if (report.type === 'local-candidate' && report.candidateType === 'relay') {
        usingTurn = true;
      }
      if (report.type === 'transport' && typeof report.dtlsState === 'string') {
        transportType = report.dtlsState;
      }
    });

    const now = Date.now();
    if (inboundFps != null && inboundFps > 0) {
      this.lastInboundFps = inboundFps;
      this.lastInboundAt = now;
    } else if (inboundBytes > this.lastInboundBytes) {
      this.lastInboundAt = now;
    }
    this.lastInboundBytes = inboundBytes;

    const mediaFrozen =
      pc.connectionState === 'connected' &&
      now - this.lastInboundAt > 8000 &&
      this.lastInboundAt > 0;

    return {
      rttMs,
      bitrateKbps,
      packetLossPct,
      jitterMs,
      iceState: pc.iceConnectionState,
      connectionState: pc.connectionState,
      usingTurn,
      reconnectCount: this.reconnectCount,
      codec,
      fps,
      inboundFps,
      outboundFps,
      width,
      height,
      audioLevel,
      candidateType,
      transportType,
      mediaFrozen,
      capturedAt: now,
    };
  }

  shouldDegrade(snapshot: RtcDiagnosticsSnapshot): 'none' | 'reduce-video' | 'audio-only' | 'ice-restart' {
    if (snapshot.mediaFrozen) return 'ice-restart';
    if (snapshot.packetLossPct !== null && snapshot.packetLossPct > 8) return 'reduce-video';
    if (snapshot.rttMs !== null && snapshot.rttMs > 600) return 'reduce-video';
    if (snapshot.iceState === 'failed') return 'ice-restart';
    if (snapshot.packetLossPct !== null && snapshot.packetLossPct > 20) return 'audio-only';
    return 'none';
  }
}

function emptySnapshot(): RtcDiagnosticsSnapshot {
  return {
    rttMs: null,
    bitrateKbps: null,
    packetLossPct: null,
    jitterMs: null,
    iceState: 'unknown',
    connectionState: 'unknown',
    usingTurn: false,
    reconnectCount: 0,
    codec: null,
    fps: null,
    inboundFps: null,
    outboundFps: null,
    width: null,
    height: null,
    audioLevel: null,
    candidateType: null,
    transportType: null,
    mediaFrozen: false,
    capturedAt: Date.now(),
  };
}
