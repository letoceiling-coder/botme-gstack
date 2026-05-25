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

export interface OperatorRtcSessionOptions {
  socket: Socket;
  callSessionId: string;
  audio: boolean;
  video: boolean;
  onStateChange?: (state: CallState) => void;
  onRemoteStream?: (stream: MediaStream) => void;
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

/** Answer/restart stored separately — ICE floods must not evict them. */
let pendingAnswer: PendingSignal | null = null;
let pendingIce: RTCIceCandidateInit[] = [];
/** Serializes async signal handling — prevents ICE/answer reorder races. */
let signalChain: Promise<void> = Promise.resolve();

function bufferRemoteSignal(payload: PendingSignal): void {
  if (payload.signalType === 'answer' || payload.signalType === 'restart') {
    if (payload.sdp) pendingAnswer = payload;
    return;
  }
  if (payload.signalType === 'ice' && payload.candidate) {
    pendingIce.push(payload.candidate);
    if (pendingIce.length > 128) pendingIce.shift();
  }
}

function takeBufferedSignals(): PendingSignal[] {
  const out: PendingSignal[] = [];
  if (pendingAnswer) out.push(pendingAnswer);
  for (const candidate of pendingIce) {
    out.push({ signalType: 'ice', candidate });
  }
  pendingAnswer = null;
  pendingIce = [];
  return out;
}

function clearBufferedSignals(): void {
  pendingAnswer = null;
  pendingIce = [];
}

async function drainBufferedSignals(): Promise<void> {
  if (!handle || !handleReady) return;
  for (const payload of takeBufferedSignals()) {
    await handle.handleRemoteSignal({
      type: payload.signalType,
      sdp: payload.sdp,
      candidate: payload.candidate,
    });
  }
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
      console.warn('[operator-rtc] TURN credentials timeout, falling back to STUN only');
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

export function joinCallAsOperator(options: OperatorRtcSessionOptions): void {
  options.socket.emit('webrtc:call-join', { callSessionId: options.callSessionId });
}

function buildRtcRuntime(
  socket: Socket,
  callSessionId: string,
  callbacks: Pick<
    OperatorRtcSessionOptions,
    'onStateChange' | 'onRemoteStream' | 'onQualityChange' | 'onRecoveryStatus'
  >,
  iceServers: RTCIceServer[],
): { rt: RtcRuntime; markRemoteNotified: () => void } {
  let remoteNotified = false;
  const notifyRemote = (stream: MediaStream | null) => {
    if (remoteNotified || !stream) return;
    if (!stream.getTracks().some((t) => t.readyState === 'live')) return;
    remoteNotified = true;
    callbacks.onRemoteStream?.(stream);
  };

  const rt = new RtcRuntime({
    iceServers,
    onSignal: (p: RtcSignalPayload) => emitSignal(socket, callSessionId, p),
    onStateChange: (s) => {
      if (s === 'connected') callStateMachine?.transition('CONNECTED');
      if (s === 'reconnecting') callStateMachine?.transition('RECONNECTING');
      if (s === 'degraded') callStateMachine?.transition('DEGRADED');
      if (s === 'failed') callStateMachine?.transition('FAILED');
      callbacks.onStateChange?.(callStateMachine?.getState() ?? 'CONNECTING');
    },
    onDiagnostics: () => {
      notifyRemote(handle?.media.getRemoteStream() ?? null);
    },
    onRemoteTrack: (stream, track) => {
      const tryNotify = () => {
        if (remoteNotified) return;
        if (!stream.getTracks().some((t) => t.readyState === 'live')) return;
        remoteNotified = true;
        callbacks.onRemoteStream?.(stream);
      };
      tryNotify();
      if (!remoteNotified) {
        track.addEventListener('unmute', tryNotify, { once: true });
      }
    },
    onQualityChange: (level, snap) => {
      callbacks.onQualityChange?.(level, QUALITY_LABELS_RU[level], snap);
    },
    onRecoveryStatus: (msg) => callbacks.onRecoveryStatus?.(msg),
  });
  return { rt, markRemoteNotified: () => { remoteNotified = true; } };
}

async function ensureOperatorRuntimeWithStream(
  socket: Socket,
  callSessionId: string,
  localStream: MediaStream,
  callbacks: Pick<
    OperatorRtcSessionOptions,
    'onStateChange' | 'onRemoteStream' | 'onQualityChange' | 'onRecoveryStatus'
  >,
): Promise<RtcRuntimeHandle> {
  if (handle) return handle;

  callStateMachine = new CallStateMachine();
  callStateMachine.transition('INVITED');
  callbacks.onStateChange?.(callStateMachine.getState());

  const { iceServers } = await fetchTurnCredentials(socket);
  const { rt } = buildRtcRuntime(socket, callSessionId, callbacks, iceServers);
  runtime = rt;
  handle = runtime.createHandle();
  handle.audio.unlockFromUserGesture();

  callStateMachine.transition('MEDIA_READY');
  callbacks.onStateChange?.(callStateMachine.getState());

  const ok = await handle.prepareForAnswerWithStream(localStream);
  if (!ok) {
    callStateMachine.transition('FAILED');
    callbacks.onStateChange?.(callStateMachine.getState());
    throw new Error('Не удалось получить доступ к микрофону/камере');
  }

  callStateMachine.transition('CONNECTING');
  callbacks.onStateChange?.(callStateMachine.getState());
  handleReady = true;
  await drainBufferedSignals();
  return handle;
}

async function ensureOperatorRuntimeAsOfferer(
  socket: Socket,
  callSessionId: string,
  localStream: MediaStream,
  constraints: { audio: boolean; video: boolean },
  callbacks: Pick<
    OperatorRtcSessionOptions,
    'onStateChange' | 'onRemoteStream' | 'onQualityChange' | 'onRecoveryStatus'
  >,
): Promise<RtcRuntimeHandle> {
  if (handle) return handle;

  callStateMachine = new CallStateMachine();
  callStateMachine.transition('ACCEPTING');
  callStateMachine.transition('MEDIA_READY');
  callbacks.onStateChange?.(callStateMachine.getState());

  const { iceServers } = await fetchTurnCredentials(socket);
  const { rt } = buildRtcRuntime(socket, callSessionId, callbacks, iceServers);
  runtime = rt;
  handle = runtime.createHandle();
  handle.audio.unlockFromUserGesture();

  const ok = await handle.acceptInviteWithStream(localStream, constraints);
  if (!ok) {
    callStateMachine.transition('FAILED');
    callbacks.onStateChange?.(callStateMachine.getState());
    throw new Error('Не удалось получить доступ к микрофону/камере');
  }

  callStateMachine.transition('CONNECTING');
  callbacks.onStateChange?.(callStateMachine.getState());
  handleReady = true;
  await drainBufferedSignals();
  return handle;
}

export async function startOutgoingCallWithStream(
  options: OperatorRtcSessionOptions,
  localStream: MediaStream,
): Promise<void> {
  joinCallAsOperator(options);
  await ensureOperatorRuntimeAsOfferer(
    options.socket,
    options.callSessionId,
    localStream,
    { audio: options.audio, video: options.video },
    options,
  );
}

export async function handleIncomingOfferWithStream(
  socket: Socket,
  callSessionId: string,
  sdp: string,
  localStream: MediaStream,
  callbacks: Pick<
    OperatorRtcSessionOptions,
    'onStateChange' | 'onRemoteStream' | 'onQualityChange' | 'onRecoveryStatus'
  >,
): Promise<void> {
  const h = await ensureOperatorRuntimeWithStream(socket, callSessionId, localStream, callbacks);
  await h.handleRemoteSignal({ type: 'offer', sdp });
  const remote = h.media.getRemoteStream();
  if (remote) callbacks.onRemoteStream?.(remote);
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
      console.error('[operator-rtc] signal error', payload.signalType, err);
    });
  await signalChain;
}

export function endOperatorCall(socket: Socket, callSessionId: string): void {
  handle?.endCall();
  destroyOperatorRtc();
  socket.emit('webrtc:call-end', { callSessionId, reason: 'ENDED' });
}

export function destroyOperatorRtc(): void {
  handle?.destroy();
  handle = null;
  runtime = null;
  callStateMachine = null;
  handleReady = false;
  signalChain = Promise.resolve();
  clearBufferedSignals();
}

export function getOperatorRemoteStream(): MediaStream | null {
  return handle?.media.getRemoteStream() ?? null;
}

export function getOperatorLocalStream(): MediaStream | null {
  return handle?.media.getLocalStream() ?? null;
}

export function getOperatorRtcHandle(): RtcRuntimeHandle | null {
  return handle;
}

export function getOperatorCallState(): CallState {
  return callStateMachine?.getState() ?? 'IDLE';
}

export async function recoverOperatorCall(
  socket: Socket,
  recoveryToken: string,
  _callbacks: Pick<
    OperatorRtcSessionOptions,
    'onStateChange' | 'onRemoteStream' | 'onQualityChange' | 'onRecoveryStatus'
  >,
): Promise<{ ok: boolean; callSessionId?: string; inviteType?: 'VOICE' | 'VIDEO' }> {
  return new Promise((resolve) => {
    socket.emit(
      'webrtc:call-recover',
      { recoveryToken },
      (resp: { ok?: boolean; callSessionId?: string; inviteType?: 'VOICE' | 'VIDEO' }) => {
        if (!resp?.ok || !resp.callSessionId) {
          resolve({ ok: false });
          return;
        }
        joinCallAsOperator({
          socket,
          callSessionId: resp.callSessionId,
          audio: true,
          video: resp.inviteType === 'VIDEO',
        });
        resolve({ ok: true, callSessionId: resp.callSessionId, inviteType: resp.inviteType });
      },
    );
  });
}
