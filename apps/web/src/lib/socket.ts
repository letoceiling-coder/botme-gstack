import { io, type Socket } from 'socket.io-client';
import type { RealtimeEvent } from '@botme/shared';
import { WS_NAMESPACES, HEARTBEAT_INTERVAL_MS } from '@botme/shared';
import { getRealtimeBaseUrl } from './realtime-url';

let socket: Socket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let statusHandler: ((connected: boolean) => void) | null = null;

export function connectAdminSocket(
  accessToken: string,
  onEvent: (event: RealtimeEvent) => void,
  onStatus: (connected: boolean) => void,
): () => void {
  disconnectAdminSocket();
  statusHandler = onStatus;

  const baseUrl = getRealtimeBaseUrl();
  socket = io(`${baseUrl}${WS_NAMESPACES.admin}`, {
    auth: accessToken ? { token: accessToken } : undefined,
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  socket.on('connect', () => {
    onStatus(true);
  });
  socket.on('disconnect', (reason) => {
    onStatus(false);
  });
  socket.on('connect_error', (err) => {
    onStatus(false);
  });
  socket.on('error', () => {
    onStatus(false);
  });
  socket.on('realtime', (event: RealtimeEvent) => onEvent(event));

  pingTimer = setInterval(() => {
    socket?.emit('ping');
  }, HEARTBEAT_INTERVAL_MS);

  return disconnectAdminSocket;
}

export function getAdminSocket(): Socket | null {
  return socket;
}

export function disconnectAdminSocket(): void {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  statusHandler?.(false);
  statusHandler = null;
}

export function isAdminSocketConnected(): boolean {
  return socket?.connected ?? false;
}
