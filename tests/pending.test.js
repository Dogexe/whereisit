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
  const row = { id: "1", deleted: false, note: "coffee" };
  markPending("transactions", [row]);
  const rows = getPendingRows("transactions");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "1");
  clearPending("transactions", [row]);
});

test("clearPending removes only the rows given", () => {
  const a = { id: "a" }, b = { id: "b" };
  markPending("bills", [a, b]);
  clearPending("bills", [a]);
  const ids = getPendingRows("bills").map((r) => r.id);
  assert.deepEqual(ids, ["b"]);
  clearPending("bills", [b]);
});

test("marking the same id again overwrites the stored row (latest wins)", () => {
  markPending("goals", [{ id: "1", saved: 10 }]);
  const second = { id: "1", saved: 20 };
  markPending("goals", [second]);
  const rows = getPendingRows("goals");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].saved, 20);
  clearPending("goals", [second]);
});

test("pending state persists across a reload via loadPending", () => {
  markPending("transactions", [{ id: "persist-me", deleted: false }]);
  // Simulate a fresh page load against the same localStorage: re-import
  // would reset the in-memory module state in a real reload, so instead
  // call loadPending() directly, which is what main.js's boot does.
  loadPending();
  const rows = getPendingRows("transactions");
  assert.ok(rows.some((r) => r.id === "persist-me"));
  clearPending("transactions", getPendingRows("transactions").filter((r) => r.id === "persist-me"));
});

// Regression test for a race between two overlapping pushes of the same
// record: edit X (row A) starts pushing, then X is edited again (row B)
// before A's push resolves. If A's success were to clear pending by id
// alone, it would wipe out B even though B was never actually confirmed
// pushed. clearPending must only remove an entry if the map still holds
// that exact row object.
test("clearPending with a stale (superseded) row object does not clear a newer pending entry", () => {
  const rowA = { id: "x", version: "A" };
  markPending("transactions", [rowA]); // push A starts, marks pending
  const rowB = { id: "x", version: "B" };
  markPending("transactions", [rowB]); // X edited again before A resolves; map now holds B
  clearPending("transactions", [rowA]); // A's push resolves successfully
  const rows = getPendingRows("transactions");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].version, "B"); // B must still be pending, not silently dropped
  clearPending("transactions", [rowB]);
});
