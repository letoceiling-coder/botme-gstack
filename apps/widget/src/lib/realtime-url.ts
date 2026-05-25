/** Socket.IO engine path is `/socket.io/` — connect to API host in dev. */
export function getRealtimeBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:3010';
  }
  return window.location.origin;
}
