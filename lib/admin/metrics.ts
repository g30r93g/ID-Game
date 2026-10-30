export const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * An open lobby only counts as active while it is still continuable. Abandoned
 * lobbies keep `isOpen: true` forever — nothing closes them — so without the
 * `abandonedAt` check every lobby ever created would be counted as active now.
 */
export function isActiveNow(game: {
  isOpen: boolean;
  abandonedAt?: number;
}): boolean {
  return game.isOpen === true && game.abandonedAt === undefined;
}

export function withinWindow(
  ts: number | undefined,
  now: number,
  windowMs: number = FOURTEEN_DAYS_MS,
): boolean {
  return ts !== undefined && ts >= now - windowMs;
}

export function gameDurationMs(game: {
  startedAt?: number;
  completedAt?: number;
}): number | null {
  if (game.startedAt === undefined || game.completedAt === undefined)
    return null;
  return game.completedAt - game.startedAt;
}

export type GameLike = {
  isOpen: boolean;
  startedAt?: number;
  completedAt?: number;
  abandonedAt?: number;
};

export function computeGameStats(games: GameLike[], now: number) {
  const activeNow = games.filter(isActiveNow).length;
  const started14d = games.filter((g) => withinWindow(g.startedAt, now)).length;
  const completedInWindow = games.filter((g) =>
    withinWindow(g.completedAt, now),
  );
  const durations = completedInWindow
    .map(gameDurationMs)
    .filter((d): d is number => d !== null && d >= 0);
  const avgLengthMs = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;
  return {
    activeNow,
    started14d,
    completed14d: completedInWindow.length,
    avgLengthMs,
  };
}

export function activePlayerCount(
  players: { userId: string; _creationTime: number }[],
  now: number,
): number {
  const recent = players.filter((p) => withinWindow(p._creationTime, now));
  return new Set(recent.map((p) => p.userId)).size;
}

export function shouldSetCompletedAt(
  toPhase: string,
  roundNumber: number,
  totalRounds: number,
): boolean {
  // A game is complete once its FINAL round reaches results. Normal play exits
  // the last round via the "Finish Game" → rate flow and never transitions to
  // the "finished" phase, so "display-results" of the final round is the real
  // terminal moment; "finished" is kept for completeness (idempotent upstream).
  const isTerminalPhase =
    toPhase === "display-results" || toPhase === "finished";
  return isTerminalPhase && totalRounds > 0 && roundNumber === totalRounds;
}

export type ScenarioSort = "popular-desc" | "popular-asc" | "newest" | "oldest";

export function scenarioSortToQuery(sort: ScenarioSort): {
  index: "byTimesSelected" | "by_creation_time";
  order: "asc" | "desc";
} {
  switch (sort) {
    case "popular-desc":
      return { index: "byTimesSelected", order: "desc" };
    case "popular-asc":
      return { index: "byTimesSelected", order: "asc" };
    case "oldest":
      return { index: "by_creation_time", order: "asc" };
    case "newest":
    default:
      return { index: "by_creation_time", order: "desc" };
  }
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function groupTimesSelected(
  rows: { scenarioId: string }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows)
    counts.set(r.scenarioId, (counts.get(r.scenarioId) ?? 0) + 1);
  return counts;
}

/**
 * Count, mean and per-star breakdown of game ratings. `distribution[i]` is the
 * number of ratings of `i + 1` stars; anything outside 1–5 is counted in the
 * total and mean but not bucketed (`submitRating` doesn't validate the value).
 */
export function computeRatingStats(
  ratings: { rating: number; _creationTime: number }[],
  now: number,
) {
  const mean = (rs: { rating: number }[]) =>
    rs.length ? rs.reduce((a, r) => a + r.rating, 0) / rs.length : null;
  const recent = ratings.filter((r) => withinWindow(r._creationTime, now));
  const distribution = [0, 0, 0, 0, 0];
  for (const r of ratings) {
    if (Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5) {
      distribution[r.rating - 1]++;
    }
  }
  return {
    total: ratings.length,
    average: mean(ratings),
    ratings14d: recent.length,
    average14d: mean(recent),
    distribution,
  };
}

export function formatRating(avg: number | null): string {
  return avg === null ? "—" : `${avg.toFixed(2)} ★`;
}
