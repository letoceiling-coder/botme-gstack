export type IceServerConfig = RTCIceServer;

import type { NetworkQualityLevel } from './network-quality.js';

export interface RtcRuntimeConfig {
  iceServers: IceServerConfig[];
  /**
   * When true, sets iceTransportPolicy to 'relay'. Disabled by default —
   * forcing relay prevents host/srflx pairs from forming and breaks calls when
   * one peer cannot allocate TURN (corporate firewall, TLS failures on turns:).
   */
  /** @deprecated Always use all candidate types — forcing relay breaks cross-network calls. */
  forceTurnRelay?: boolean;
  onSignal?: (payload: RtcSignalPayload) => void;
  onStateChange?: (state: RtcConnectionState) => void;
  onDiagnostics?: (snapshot: RtcDiagnosticsSnapshot) => void;
  onQualityChange?: (level: NetworkQualityLevel, snapshot: RtcDiagnosticsSnapshot) => void;
  onRecoveryStatus?: (message: string | null) => void;
  onRemoteTrack?: (stream: MediaStream, track: MediaStreamTrack) => void;
}

export interface RtcSignalPayload {
  type: 'offer' | 'answer' | 'ice' | 'restart';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

export type RtcConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'degraded'
  | 'failed'
  | 'closed';

export interface RtcDiagnosticsSnapshot {
  rttMs: number | null;
  bitrateKbps: number | null;
  packetLossPct: number | null;
  jitterMs: number | null;
  iceState: RTCIceConnectionState | 'unknown';
  connectionState: RTCPeerConnectionState | 'unknown';
  usingTurn: boolean;
  reconnectCount: number;
  codec: string | null;
  fps: number | null;
  inboundFps: number | null;
  outboundFps: number | null;
  width: number | null;
  height: number | null;
  audioLevel: number | null;
  candidateType: string | null;
  transportType: string | null;
  mediaFrozen: boolean;
  capturedAt: number;
}

export interface MediaConstraintsRequest {
  audio: boolean;
  video: boolean | MediaTrackConstraints;
}

export type PeerConnectionFactory = (config: RTCConfiguration) => RTCPeerConnection;

export const defaultPeerConnectionFactory: PeerConnectionFactory = (config) =>
  new RTCPeerConnection(config);
