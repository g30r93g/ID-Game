import { expect, test } from "vitest";
import {
  IDLE_LOBBY_TIMEOUT_MS,
  STALE_GAME_TIMEOUT_MS,
  evaluateContinuity,
} from "./continuable";

const now = 10_000_000;

function game(overrides: Partial<Parameters<typeof evaluateContinuity>[0]>) {
  return {
    startedAt: now,
    lastActivityAt: now,
    activePlayerCount: 2,
    ...overrides,
  };
}

test("a game nobody is left in is not continuable", () => {
  expect(evaluateContinuity(game({ activePlayerCount: 0 }), now)).toEqual({
    continuable: false,
    reason: "no-players",
  });
});

test("a lone remaining player can still continue", () => {
  expect(evaluateContinuity(game({ activePlayerCount: 1 }), now)).toEqual({
    continuable: true,
  });
});

test("a started game goes stale after the timeout, not before", () => {
  const atLimit = now - STALE_GAME_TIMEOUT_MS;
  expect(evaluateContinuity(game({ lastActivityAt: atLimit }), now)).toEqual({
    continuable: true,
  });

  expect(
    evaluateContinuity(game({ lastActivityAt: atLimit - 1 }), now),
  ).toEqual({ continuable: false, reason: "stale" });
});

test("an idle lobby expires on the shorter lobby timeout", () => {
  const idle = now - IDLE_LOBBY_TIMEOUT_MS - 1;
  expect(
    evaluateContinuity(
      game({ startedAt: undefined, lastActivityAt: idle }),
      now,
    ),
  ).toEqual({ continuable: false, reason: "idle-lobby" });

  // The same idle gap in a started game is nowhere near stale.
  expect(evaluateContinuity(game({ lastActivityAt: idle }), now)).toEqual({
    continuable: true,
  });
});

test("a long-open lobby stays continuable while someone is heartbeating", () => {
  expect(
    evaluateContinuity(
      game({ startedAt: undefined, lastActivityAt: now - 1000 }),
      now,
    ),
  ).toEqual({ continuable: true });
});
