import { io, type Socket } from 'socket.io-client';
import type { LiveVisitorDto, WidgetMessageDto } from '@botme/shared';
import { WS_NAMESPACES } from '@botme/shared';

function wsBase(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export type OperatorConnectionState = 'connecting' | 'online' | 'offline' | 'reconnecting';

export interface WebRtcSignalEvent {
  callSessionId: string;
  signalType: 'offer' | 'answer' | 'ice' | 'restart';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  from?: string;
}

export interface OperatorSocketHandlers {
  onVisitors: (visitors: LiveVisitorDto[]) => void;
  onEvent: (event: { type: string; conversationId?: string }) => void;
  onConnection: (state: OperatorConnectionState) => void;
  onError: (message: string) => void;
  onNewMessage?: (payload: { conversationId: string; message: WidgetMessageDto }) => void;
  onVisitorTyping?: (payload: { conversationId: string; active: boolean }) => void;
  onWebRtcSignal?: (payload: WebRtcSignalEvent) => void;
  onCallEnd?: () => void;
  onRecoveryToken?: (payload: { callSessionId: string; recoveryToken: string; inviteType?: string }) => void;
}

export interface OperatorSocketHandle {
  socket: Socket;
  disconnect: () => void;
}

export function connectOperatorSocket(handlers: OperatorSocketHandlers): OperatorSocketHandle {
  const socket: Socket = io(`${wsBase()}${WS_NAMESPACES.operator}`, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  handlers.onConnection('connecting');

  socket.on('connect', () => {
    handlers.onConnection('online');
    socket.emit('operator:subscribe', {});
  });

  socket.on('disconnect', () => handlers.onConnection('offline'));
  socket.io.on('reconnect_attempt', () => handlers.onConnection('reconnecting'));
  socket.io.on('reconnect', () => handlers.onConnection('online'));

  socket.on('operator:visitors', (payload: { visitors: LiveVisitorDto[] }) => {
    handlers.onVisitors(payload.visitors);
  });

  socket.on('operator:event', (payload: { type: string; conversationId?: string }) => {
    handlers.onEvent(payload);
  });

  socket.on('operator:new-message', (payload: { conversationId: string; message: WidgetMessageDto }) => {
    handlers.onNewMessage?.(payload);
  });

  socket.on('operator:visitor-typing', (payload: { conversationId: string; active: boolean }) => {
    handlers.onVisitorTyping?.(payload);
  });

  socket.on('error', (payload: { message?: string }) => {
    handlers.onError(payload.message ?? 'Ошибка оператора');
  });

  socket.on('webrtc:signal', (payload: WebRtcSignalEvent) => {
    handlers.onWebRtcSignal?.(payload);
  });

  socket.on('webrtc:call-end', () => {
    handlers.onCallEnd?.();
  });

  socket.on('webrtc:recovery-token', (payload: { callSessionId: string; recoveryToken: string; inviteType?: string }) => {
    handlers.onRecoveryToken?.(payload);
  });

  const ping = setInterval(() => {
    if (socket.connected) socket.emit('ping');
  }, 25_000);

  return {
    socket,
    disconnect: () => {
      clearInterval(ping);
      socket.disconnect();
    },
  };
}

export function emitTakeover(socket: Socket, conversationId: string): void {
  socket.emit('operator:takeover', { conversationId });
}

export function emitRelease(socket: Socket, conversationId: string): void {
  socket.emit('operator:release', { conversationId });
}

export function emitEnableCallControls(
  socket: Socket,
  conversationId: string,
  voiceEnabled: boolean,
  videoEnabled: boolean,
): void {
  socket.emit('operator:enable-call-controls', { conversationId, voiceEnabled, videoEnabled });
}

export function emitCallInvite(
  socket: Socket,
  conversationId: string,
  visitorSessionId: string,
  type: 'VOICE' | 'VIDEO',
  ack?: (resp: { ok: boolean; callSessionId?: string }) => void,
): void {
  socket.emit('operator:call-invite', { conversationId, visitorSessionId, type }, ack);
}

export function fetchConversation(
  socket: Socket,
  conversationId: string,
): Promise<{ conversationId: string; messages: WidgetMessageDto[] }> {
  return new Promise((resolve, reject) => {
    socket.emit('operator:fetch-conversation', { conversationId }, (resp: unknown) => {
      if (!resp || typeof resp !== 'object') {
        reject(new Error('Не удалось загрузить диалог'));
        return;
      }
      resolve(resp as { conversationId: string; messages: WidgetMessageDto[] });
    });
  });
}

export function sendOperatorMessage(
  socket: Socket,
  conversationId: string,
  content: string,
): Promise<{ ok: boolean; message?: WidgetMessageDto }> {
  return new Promise((resolve) => {
    socket.emit('operator:send-message', { conversationId, content }, (resp: { ok: boolean; message?: WidgetMessageDto }) => {
      resolve(resp ?? { ok: false });
    });
  });
}

export function emitOperatorTyping(socket: Socket, conversationId: string, active: boolean): void {
  socket.emit('operator:typing', { conversationId, active });
}
