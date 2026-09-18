import { expect, test } from "vitest";
import { nextIdentityAction } from "./posthog-identity";

const USER = "user_1";
const OTHER_USER = "user_2";

test("nextIdentityAction waits while the session is still loading", () => {
  expect(
    nextIdentityAction({ isPending: true, userId: null, identifiedAs: null }),
  ).toBe("none");
  // Crucially it also waits when PostHog is already identified, so a reload
  // does not reset the person between paint and session hydration.
  expect(
    nextIdentityAction({ isPending: true, userId: null, identifiedAs: USER }),
  ).toBe("none");
});

test("nextIdentityAction identifies a signed-in account", () => {
  expect(
    nextIdentityAction({ isPending: false, userId: USER, identifiedAs: null }),
  ).toBe("identify");
});

test("nextIdentityAction re-identifies the same account harmlessly", () => {
  expect(
    nextIdentityAction({ isPending: false, userId: USER, identifiedAs: USER }),
  ).toBe("identify");
});

test("nextIdentityAction resets before claiming the device for a second account", () => {
  expect(
    nextIdentityAction({
      isPending: false,
      userId: OTHER_USER,
      identifiedAs: USER,
    }),
  ).toBe("reidentify");
});

test("nextIdentityAction resets an identified device once signed out", () => {
  expect(
    nextIdentityAction({ isPending: false, userId: null, identifiedAs: USER }),
  ).toBe("reset");
  expect(
    nextIdentityAction({
      isPending: false,
      userId: undefined,
      identifiedAs: USER,
    }),
  ).toBe("reset");
});

test("nextIdentityAction leaves an already-anonymous device alone", () => {
  expect(
    nextIdentityAction({ isPending: false, userId: null, identifiedAs: null }),
  ).toBe("none");
});
