export const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export function isActiveNow(game: { isOpen: boolean }): boolean {
  return game.isOpen === true;
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
  if (game.startedAt === undefined || game.completedAt === undefined) return null;
  return game.completedAt - game.startedAt;
}

export type GameLike = { isOpen: boolean; startedAt?: number; completedAt?: number };

export function computeGameStats(games: GameLike[], now: number) {
  const activeNow = games.filter(isActiveNow).length;
  const started14d = games.filter((g) => withinWindow(g.startedAt, now)).length;
  const completedInWindow = games.filter((g) => withinWindow(g.completedAt, now));
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
  return toPhase === "finished" && totalRounds > 0 && roundNumber === totalRounds;
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

export function groupTimesSelected(rows: { scenarioId: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.scenarioId, (counts.get(r.scenarioId) ?? 0) + 1);
  return counts;
}
