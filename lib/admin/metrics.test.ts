import { describe, expect, it } from "vitest";
import {
  activePlayerCount,
  computeGameStats,
  formatDuration,
  gameDurationMs,
  groupTimesSelected,
  scenarioSortToQuery,
  shouldSetCompletedAt,
  withinWindow,
  FOURTEEN_DAYS_MS,
} from "./metrics";

const NOW = 1_000_000_000_000;

describe("withinWindow", () => {
  it("is false for undefined", () => expect(withinWindow(undefined, NOW)).toBe(false));
  it("is true just inside the window", () =>
    expect(withinWindow(NOW - FOURTEEN_DAYS_MS + 1, NOW)).toBe(true));
  it("is false just outside the window", () =>
    expect(withinWindow(NOW - FOURTEEN_DAYS_MS - 1, NOW)).toBe(false));
});

describe("gameDurationMs", () => {
  it("returns null when not finished", () =>
    expect(gameDurationMs({ startedAt: 5 })).toBeNull());
  it("returns the delta when finished", () =>
    expect(gameDurationMs({ startedAt: 5, completedAt: 20 })).toBe(15));
});

describe("computeGameStats", () => {
  it("counts active, started, completed and averages durations in-window", () => {
    const games = [
      { isOpen: true, startedAt: NOW - 1000 },
      { isOpen: false, startedAt: NOW - 2000, completedAt: NOW - 1000 }, // dur 1000
      { isOpen: false, startedAt: NOW - 5000, completedAt: NOW - 1000 }, // dur 4000
      { isOpen: false, startedAt: 1, completedAt: 2 }, // completed long ago -> excluded
    ];
    expect(computeGameStats(games, NOW)).toEqual({
      activeNow: 1,
      started14d: 3,
      completed14d: 2,
      avgLengthMs: 2500,
    });
  });
  it("returns null average when nothing completed in-window", () => {
    expect(computeGameStats([{ isOpen: true }], NOW).avgLengthMs).toBeNull();
  });
});

describe("activePlayerCount", () => {
  it("dedupes users and ignores old rows", () => {
    const players = [
      { userId: "a", _creationTime: NOW - 1000 },
      { userId: "a", _creationTime: NOW - 2000 },
      { userId: "b", _creationTime: NOW - 3000 },
      { userId: "c", _creationTime: NOW - FOURTEEN_DAYS_MS - 1 },
    ];
    expect(activePlayerCount(players, NOW)).toBe(2);
  });
});

describe("shouldSetCompletedAt", () => {
  it("true on final round showing results", () => expect(shouldSetCompletedAt("display-results", 3, 3)).toBe(true));
  it("true on final round finishing", () => expect(shouldSetCompletedAt("finished", 3, 3)).toBe(true));
  it("false on display-results of a non-final round", () => expect(shouldSetCompletedAt("display-results", 2, 3)).toBe(false));
  it("false on a non-final round", () => expect(shouldSetCompletedAt("finished", 2, 3)).toBe(false));
  it("false for a non-terminal phase", () => expect(shouldSetCompletedAt("rank-players", 3, 3)).toBe(false));
  it("false for infinite games", () => expect(shouldSetCompletedAt("display-results", 1, 0)).toBe(false));
});

describe("scenarioSortToQuery", () => {
  it("maps popularity and age", () => {
    expect(scenarioSortToQuery("popular-desc")).toEqual({ index: "byTimesSelected", order: "desc" });
    expect(scenarioSortToQuery("popular-asc")).toEqual({ index: "byTimesSelected", order: "asc" });
    expect(scenarioSortToQuery("newest")).toEqual({ index: "by_creation_time", order: "desc" });
    expect(scenarioSortToQuery("oldest")).toEqual({ index: "by_creation_time", order: "asc" });
  });
});

describe("formatDuration", () => {
  it("renders em dash for null", () => expect(formatDuration(null)).toBe("—"));
  it("renders m/s", () => expect(formatDuration(664_000)).toBe("11m 04s"));
});

describe("groupTimesSelected", () => {
  it("counts per scenarioId", () => {
    const m = groupTimesSelected([{ scenarioId: "x" }, { scenarioId: "x" }, { scenarioId: "y" }]);
    expect(m.get("x")).toBe(2);
    expect(m.get("y")).toBe(1);
  });
});
