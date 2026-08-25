import test from "node:test";
import assert from "node:assert/strict";

// pending.js reads window.localStorage lazily (inside each function call,
// not at module load), so a minimal in-memory stub installed before import
// is enough -- no jsdom or other dependency needed.
function makeFakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
}
globalThis.window = { localStorage: makeFakeLocalStorage() };

const { markPending, clearPending, getPendingRows, loadPending } = await import("../src/pending.js");

test("markPending then getPendingRows returns the marked rows", () => {
  markPending("transactions", [{ id: "1", deleted: false, note: "coffee" }]);
  const rows = getPendingRows("transactions");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "1");
  clearPending("transactions", ["1"]);
});

test("clearPending removes only the given ids", () => {
  markPending("bills", [{ id: "a" }, { id: "b" }]);
  clearPending("bills", ["a"]);
  const ids = getPendingRows("bills").map((r) => r.id);
  assert.deepEqual(ids, ["b"]);
  clearPending("bills", ["b"]);
});

test("marking the same id again overwrites the stored row (latest wins)", () => {
  markPending("goals", [{ id: "1", saved: 10 }]);
  markPending("goals", [{ id: "1", saved: 20 }]);
  const rows = getPendingRows("goals");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].saved, 20);
  clearPending("goals", ["1"]);
});

test("pending state persists across a reload via loadPending", () => {
  markPending("transactions", [{ id: "persist-me", deleted: false }]);
  // Simulate a fresh page load against the same localStorage: re-import
  // would reset the in-memory module state in a real reload, so instead
  // call loadPending() directly, which is what main.js's boot does.
  loadPending();
  const rows = getPendingRows("transactions");
  assert.ok(rows.some((r) => r.id === "persist-me"));
  clearPending("transactions", ["persist-me"]);
});
