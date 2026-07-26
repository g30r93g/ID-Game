// Rules deciding whether an unfinished game is still worth offering back to a
// player in "Jump back in". A game can be technically unfinished but socially
// dead: everyone closed their tab hours ago, or a lobby was created and
// abandoned before it ever started. Those are hidden. A game whose players are
// merely offline *right now* is still continuable — you can rejoin and wait.
//
// Both timeouts are measured against the game's last activity, i.e. the newest
// heartbeat from any of its players, never against creation time. A lobby six
// people have been sitting in for an hour is alive; one someone opened and
// walked away from is not.

/** A started game with no heartbeat for this long is abandoned. */
export const STALE_GAME_TIMEOUT_MS = 2 * 60 * 60_000;

/** A never-started lobby with no heartbeat for this long is abandoned. */
export const IDLE_LOBBY_TIMEOUT_MS = 30 * 60_000;

/**
 * Players still needed for a game to be worth resuming. Deliberately 1: in a
 * two-player game the other player may have lost their device or network, and
 * should be able to come back to a game that still exists.
 */
export const MIN_ACTIVE_PLAYERS = 1;

export type NotContinuableReason = "no-players" | "idle-lobby" | "stale";

export type Continuity =
  | { continuable: true }
  | { continuable: false; reason: NotContinuableReason };

export type ContinuityInput = {
  /** Unset while the game is still in its lobby. */
  startedAt?: number;
  /**
   * Newest `lastAlive` across the game's active players. Every player row gets
   * a heartbeat on join, so this is always a real timestamp once the
   * `no-players` check below has passed.
   */
  lastActivityAt: number;
  /** Players not removed from the game, whether or not they're connected. */
  activePlayerCount: number;
};

export function evaluateContinuity(
  { startedAt, lastActivityAt, activePlayerCount }: ContinuityInput,
  now: number,
): Continuity {
  if (activePlayerCount < MIN_ACTIVE_PLAYERS) {
    return { continuable: false, reason: "no-players" };
  }

  const idleFor = now - lastActivityAt;

  if (startedAt === undefined) {
    return idleFor > IDLE_LOBBY_TIMEOUT_MS
      ? { continuable: false, reason: "idle-lobby" }
      : { continuable: true };
  }

  return idleFor > STALE_GAME_TIMEOUT_MS
    ? { continuable: false, reason: "stale" }
    : { continuable: true };
}
