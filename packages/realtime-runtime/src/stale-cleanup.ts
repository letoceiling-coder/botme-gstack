import type { SocketRegistry } from './socket-registry.js';
import type { HeartbeatManager } from './heartbeat-manager.js';

export interface StaleCleanupResult {
  staleSocketIds: string[];
}

export function findStaleSockets(
  registry: SocketRegistry,
  heartbeat: HeartbeatManager,
  now = Date.now(),
): StaleCleanupResult {
  const staleSocketIds = new Set<string>();
  for (const entry of registry.listStale(now)) {
    staleSocketIds.add(entry.socketId);
  }
  for (const entry of registry.listStale(now)) {
    if (heartbeat.isStale(entry.socketId, now)) staleSocketIds.add(entry.socketId);
  }
  return { staleSocketIds: [...staleSocketIds] };
}
