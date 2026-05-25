import type { Socket } from 'socket.io-client';
import {
  CallStateMachine,
  QUALITY_LABELS_RU,
  RtcRuntime,
  type CallState,
  type NetworkQualityLevel,
  type RtcDiagnosticsSnapshot,
  type RtcRuntimeHandle,
  type RtcSignalPayload,
} from '@botme/rtc-runtime';

export interface WidgetRtcSessionOptions {
  socket: Socket;
  callSessionId: string;
  audio: boolean;
  video: boolean;
  onStateChange?: (state: CallState) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onError?: (message: string) => void;
  onQualityChange?: (level: NetworkQualityLevel, label: string, snapshot: RtcDiagnosticsSnapshot) => void;
  onRecoveryStatus?: (message: string | null) => void;
}

let runtime: RtcRuntime | null = null;
let handle: RtcRuntimeHandle | null = null;
let handleReady = false;
let callStateMachine: CallStateMachine | null = null;

type PendingSignal = {
  signalType: 'offer' | 'answer' | 'ice' | 'restart';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
};

/** Offer/restart is stored separately so ICE floods cannot evict it. */
let pendingOffer: PendingSignal | null = null;
let pendingIce: RTCIceCandidateInit[] = [];
/** Serializes async signal handling — prevents ICE arriving before setRemoteDescription. */
let signalChain: Promise<void> = Promise.resolve();

function bufferRemoteSignal(payload: PendingSignal): void {
  if (payload.signalType === 'offer' || payload.signalType === 'restart') {
    if (payload.sdp) pendingOffer = payload;
    return;
  }
  if (payload.signalType === 'ice' && payload.candidate) {
    pendingIce.push(payload.candidate);
    if (pendingIce.length > 128) pendingIce.shift();
  }
}

function takeBufferedSignals(): PendingSignal[] {
  const out: PendingSignal[] = [];
  if (pendingOffer) out.push(pendingOffer);
  for (const candidate of pendingIce) {
    out.push({ signalType: 'ice', candidate });
  }
  pendingOffer = null;
  pendingIce = [];
  return out;
}

function clearBufferedSignals(): void {
  pendingOffer = null;
  pendingIce = [];
}

/** Call synchronously from a user click — before any await. */
export function acquireLocalMedia(constraints: {
  audio: boolean;
  video: boolean;
}): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error('getUserMedia недоступен'));
  }
  return navigator.mediaDevices.getUserMedia({
    audio: constraints.audio,
    video: constraints.video,
  });
}

function emitSignal(socket: Socket, callSessionId: string, payload: RtcSignalPayload): void {
  socket.emit('webrtc:signal', {
    callSessionId,
    type: payload.type,
    sdp: payload.sdp,
    candidate: payload.candidate,
  });
}

interface TurnCredsResponse {
  iceServers?: RTCIceServer[];
  urls?: string[];
  username?: string;
  credential?: string;
  disabled?: boolean;
}

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

function normalizeTurnCreds(creds: TurnCredsResponse): RTCIceServer[] {
  if (creds.disabled) return FALLBACK_ICE_SERVERS;
  if (Array.isArray(creds.iceServers) && creds.iceServers.length > 0) {
    return creds.iceServers;
  }
  // Legacy server (pre-M11.6D): one entry with all urls + credentials. Split
  // STUN out so the entry stays spec-compliant for browsers.
  if (Array.isArray(creds.urls) && creds.urls.length > 0) {
    const stunUrls = creds.urls.filter((u) => u.startsWith('stun:'));
    const turnUrls = creds.urls.filter((u) => u.startsWith('turn:') || u.startsWith('turns:'));
    const servers: RTCIceServer[] = [];
    if (stunUrls.length) servers.push({ urls: stunUrls });
    if (turnUrls.length && creds.username && creds.credential) {
      servers.push({ urls: turnUrls, username: creds.username, credential: creds.credential });
    }
    return servers.length ? servers : FALLBACK_ICE_SERVERS;
  }
  return FALLBACK_ICE_SERVERS;
}

async function fetchTurnCredentials(socket: Socket): Promise<{ iceServers: RTCIceServer[]; hasTurn: boolean }> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('[widget-rtc] TURN credentials timeout, falling back to STUN only');
      resolve({ iceServers: FALLBACK_ICE_SERVERS, hasTurn: false });
    }, 10000);
    socket.once('webrtc:turn-credentials', (creds: TurnCredsResponse) => {
      clearTimeout(timeout);
      const iceServers = normalizeTurnCreds(creds);
      const hasTurn = iceServers.some((s) => {
        const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
        return urls.some((u) => typeof u === 'string' && (u.startsWith('turn:') || u.startsWith('turns:')));
      });
      resolve({ iceServers, hasTurn });
    });
    socket.emit('webrtc:turn-credentials');
  });
}

/** Visitor accepts a call — set up as ANSWERER. Operator created the offer. */
async function bootstrapAnswererRuntime(
  options: WidgetRtcSessionOptions,
  localStream: MediaStream,
): Promise<boolean> {
  // Operator sends offer BEFORE visitor clicks Accept. Those signals live in
  // pendingOffer/pendingIce — destroyCallRuntime() must NOT wipe them.
  const buffered = takeBufferedSignals();
  destroyCallRuntime();
  for (const sig of buffered) bufferRemoteSignal(sig);

  callStateMachine = new CallStateMachine();
  callStateMachine.transition('ACCEPTING');
  options.onStateChange?.(callStateMachine.getState());

  const { iceServers } = await fetchTurnCredentials(options.socket);
  options.socket.emit('webrtc:call-join', { callSessionId: options.callSessionId });

  let remoteNotified = false;

  runtime = new RtcRuntime({
    iceServers,
    onSignal: (p) => emitSignal(options.socket, options.callSessionId, p),
    onStateChange: (s) => {
      if (s === 'connected') callStateMachine?.transition('CONNECTED');
      if (s === 'reconnecting') callStateMachine?.transition('RECONNECTING');
      if (s === 'degraded') callStateMachine?.transition('DEGRADED');
      if (s === 'failed') callStateMachine?.transition('FAILED');
      options.onStateChange?.(callStateMachine?.getState() ?? 'CONNECTING');
    },
    onDiagnostics: () => {
      if (remoteNotified) return;
      const remote = handle?.media.getRemoteStream();
      if (remote && remote.getTracks().some((t) => t.readyState === 'live')) {
        remoteNotified = true;
        options.onRemoteStream?.(remote);
      }
    },
    onRemoteTrack: (stream, track) => {
      const tryNotify = () => {
        if (remoteNotified) return;
        if (!stream.getTracks().some((t) => t.readyState === 'live')) return;
        remoteNotified = true;
        options.onRemoteStream?.(stream);
      };
      tryNotify();
      if (!remoteNotified) {
        track.addEventListener('unmute', tryNotify, { once: true });
      }
    },
    onQualityChange: (level, snap) => {
      options.onQualityChange?.(level, QUALITY_LABELS_RU[level], snap);
    },
    onRecoveryStatus: (msg) => options.onRecoveryStatus?.(msg),
  });

  handle = runtime.createHandle();
  handle.audio.unlockFromUserGesture();

  callStateMachine.transition('MEDIA_READY');
  options.onStateChange?.(callStateMachine.getState());

  const ok = await handle.prepareForAnswerWithStream(localStream);
  if (!ok) {
    callStateMachine.transition('FAILED');
    options.onError?.('Не удалось установить соединение');
    options.onStateChange?.(callStateMachine.getState());
    return false;
  }

  handleReady = true;
  callStateMachine.transition('CONNECTING');
  options.onStateChange?.(callStateMachine.getState());

  await drainBufferedSignals();

  return true;
}

async function drainBufferedSignals(): Promise<void> {
  if (!handle || !handleReady) return;
  const drain = takeBufferedSignals();
  for (const payload of drain) {
    await handle.handleRemoteSignal({
      type: payload.signalType,
      sdp: payload.sdp,
      candidate: payload.candidate,
    });
  }
}

/** Accept call with media already acquired from a direct user gesture. */
export async function acceptCallWithStream(
  options: WidgetRtcSessionOptions,
  localStream: MediaStream,
): Promise<boolean> {
  try {
    return await bootstrapAnswererRuntime(options, localStream);
  } catch {
    options.onError?.('Не удалось получить доступ к микрофону/камере');
    return false;
  }
}

export async function handleRemoteSignal(payload: {
  signalType: 'offer' | 'answer' | 'ice' | 'restart';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}): Promise<void> {
  if (!handle || !handleReady) {
    bufferRemoteSignal(payload);
    return;
  }
  signalChain = signalChain
    .then(async () => {
      if (!handle) return;
      await handle.handleRemoteSignal({
        type: payload.signalType,
        sdp: payload.sdp,
        candidate: payload.candidate,
      });
    })
    .catch((err: unknown) => {
      console.error('[widget-rtc] signal error', payload.signalType, err);
    });
  await signalChain;
}

export function endCall(socket: Socket, callSessionId: string): void {
  handle?.endCall();
  destroyCallRuntime();
  socket.emit('webrtc:call-end', { callSessionId, reason: 'ENDED' });
}

export function destroyCallRuntime(): void {
  handle?.destroy();
  handle = null;
  handleReady = false;
  runtime = null;
  callStateMachine = null;
  clearBufferedSignals();
  signalChain = Promise.resolve();
}

export function getCallState(): CallState {
  return callStateMachine?.getState() ?? 'IDLE';
}

export function getLocalStream(): MediaStream | null {
  return handle?.media.getLocalStream() ?? null;
}

export function getRemoteStream(): MediaStream | null {
  return handle?.media.getRemoteStream() ?? null;
}

export function getRtcHandle(): RtcRuntimeHandle | null {
  return handle;
}

export async function recoverActiveCall(
  options: WidgetRtcSessionOptions & { recoveryToken: string },
): Promise<boolean> {
  return new Promise((resolve) => {
    options.socket.emit(
      'webrtc:call-recover',
      { recoveryToken: options.recoveryToken },
      (resp: { ok?: boolean; callSessionId?: string; inviteType?: string }) => {
        if (!resp?.ok || !resp.callSessionId) {
          options.onError?.('Не удалось восстановить звонок');
          resolve(false);
          return;
        }
        resolve(false);
      },
    );
  });
}

export async function onPeerReconnected(): Promise<void> {
  if (handle) await handle.reconnectCall();
}
