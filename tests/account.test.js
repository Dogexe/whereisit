import test from "node:test";
import assert from "node:assert/strict";

// Same lazy window.localStorage pattern as tests/pending.test.js and
// tests/watermark.test.js -- account.js reads it inside getStoredUserId/
// setStoredUserId, not at module load.
function makeFakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
}
if (!globalThis.window) globalThis.window = { localStorage: makeFakeLocalStorage() };

const { shouldWipeLocalData, getStoredUserId, setStoredUserId } = await import("../src/account.js");

test("shouldWipeLocalData: no stored id -> no wipe (anonymous-use-then-sign-in migration)", () => {
  assert.equal(shouldWipeLocalData(null, "user-a"), false);
});

test("shouldWipeLocalData: same id -> no wipe (same account resuming)", () => {
  assert.equal(shouldWipeLocalData("user-a", "user-a"), false);
});

test("shouldWipeLocalData: different id -> wipe", () => {
  assert.equal(shouldWipeLocalData("user-a", "user-b"), true);
});

test("shouldWipeLocalData: stored id with a null incoming id -> no wipe", () => {
  assert.equal(shouldWipeLocalData("user-a", null), false);
});

test("getStoredUserId/setStoredUserId round-trip through localStorage", () => {
  setStoredUserId("user-x");
  assert.equal(getStoredUserId(), "user-x");
  setStoredUserId(null);
  assert.equal(getStoredUserId(), null);
});
