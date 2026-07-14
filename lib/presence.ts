// Presence/liveness constants and helper, shared by the Convex backend and the
// game client. The heartbeat is written by `sendHeartbeat` every
// HEARTBEAT_INTERVAL_MS; a player is considered connected while their most
// recent heartbeat is newer than PRESENCE_TIMEOUT_MS.
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const PRESENCE_TIMEOUT_MS = 45_000;

export function isConnected(lastAlive: number, now: number): boolean {
  return now - lastAlive < PRESENCE_TIMEOUT_MS;
}
