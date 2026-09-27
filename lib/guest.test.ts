import { describe, expect, test } from "vitest";
import {
  canDeleteGuest,
  GUEST_GRACE_PERIOD_MS,
  guestPlaceholderName,
  isGuestPlaceholderName,
  upgradePath,
} from "./guest";

describe("guestPlaceholderName", () => {
  test("always has four digits", () => {
    expect(guestPlaceholderName(() => 0)).toBe("Guest 0000");
    expect(guestPlaceholderName(() => 0.0042)).toBe("Guest 0042");
    expect(guestPlaceholderName(() => 0.99999)).toBe("Guest 9999");
  });

  test("is recognised as a placeholder", () => {
    expect(isGuestPlaceholderName(guestPlaceholderName())).toBe(true);
  });
});

describe("isGuestPlaceholderName", () => {
  test("rejects real names", () => {
    expect(isGuestPlaceholderName("Ada")).toBe(false);
    expect(isGuestPlaceholderName("Guest")).toBe(false);
    expect(isGuestPlaceholderName("Guest 12345")).toBe(false);
    expect(isGuestPlaceholderName("My Guest 1234")).toBe(false);
  });
});

test("upgradePath opens the sign-up tab and returns to where they were", () => {
  expect(upgradePath("/game/ABC123")).toBe(
    "/sign-in?tab=sign-up&next=%2Fgame%2FABC123",
  );
});

describe("canDeleteGuest", () => {
  const NOW = 1_000_000_000_000;
  const old = NOW - GUEST_GRACE_PERIOD_MS;

  test("keeps guests inside the grace period", () => {
    expect(canDeleteGuest(old + 1, [], NOW)).toBe(false);
  });

  test("deletes old guests with no sessions", () => {
    expect(canDeleteGuest(old, [], NOW)).toBe(true);
  });

  test("deletes old guests whose sessions have all expired", () => {
    expect(canDeleteGuest(old, [NOW - 1, NOW], NOW)).toBe(true);
  });

  test("keeps old guests with a session still live", () => {
    expect(canDeleteGuest(old, [NOW - 1, NOW + 1], NOW)).toBe(false);
  });
});
