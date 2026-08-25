import test from "node:test";
import assert from "node:assert/strict";

// Same lazy window.localStorage pattern as tests/pending.test.js.
function makeFakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
}
if (!globalThis.window) globalThis.window = { localStorage: makeFakeLocalStorage() };

const { getWatermark, advanceWatermark, resetWatermark, loadWatermark } = await import("../src/watermark.js");

test("a table with no watermark yet returns null (falls back to a full pull)", () => {
  resetWatermark();
  assert.equal(getWatermark("transactions"), null);
});

test("advanceWatermark sets the watermark to the newest updated_at among the given rows", () => {
  resetWatermark();
  advanceWatermark("transactions", [
    { id: "1", updated_at: "2026-01-01T00:00:00.000Z" },
    { id: "2", updated_at: "2026-01-03T00:00:00.000Z" },
    { id: "3", updated_at: "2026-01-02T00:00:00.000Z" }
  ]);
  assert.equal(getWatermark("transactions"), "2026-01-03T00:00:00.000Z");
});

test("advanceWatermark never moves the watermark backwards", () => {
  resetWatermark();
  advanceWatermark("bills", [{ id: "1", updated_at: "2026-01-05T00:00:00.000Z" }]);
  advanceWatermark("bills", [{ id: "2", updated_at: "2026-01-01T00:00:00.000Z" }]);
  assert.equal(getWatermark("bills"), "2026-01-05T00:00:00.000Z");
});

test("advanceWatermark with an empty rows array is a no-op", () => {
  resetWatermark();
  advanceWatermark("goals", [{ id: "1", updated_at: "2026-01-05T00:00:00.000Z" }]);
  advanceWatermark("goals", []);
  assert.equal(getWatermark("goals"), "2026-01-05T00:00:00.000Z");
});

test("a tombstone row (deleted:true with a fresh updated_at) advances the watermark like any other row", () => {
  resetWatermark();
  advanceWatermark("transactions", [{ id: "1", updated_at: "2026-01-01T00:00:00.000Z", deleted: false }]);
  advanceWatermark("transactions", [{ id: "1", updated_at: "2026-01-02T00:00:00.000Z", deleted: true }]);
  assert.equal(getWatermark("transactions"), "2026-01-02T00:00:00.000Z");
});

test("resetWatermark clears every table back to null", () => {
  advanceWatermark("transactions", [{ id: "1", updated_at: "2026-01-01T00:00:00.000Z" }]);
  advanceWatermark("budgets", [{ id: "1", updated_at: "2026-01-01T00:00:00.000Z" }]);
  resetWatermark();
  assert.equal(getWatermark("transactions"), null);
  assert.equal(getWatermark("budgets"), null);
});

test("watermark persists across a reload via loadWatermark", () => {
  resetWatermark();
  advanceWatermark("goals", [{ id: "1", updated_at: "2026-02-01T00:00:00.000Z" }]);
  loadWatermark();
  assert.equal(getWatermark("goals"), "2026-02-01T00:00:00.000Z");
  resetWatermark();
});
