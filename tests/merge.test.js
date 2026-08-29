import test from "node:test";
import assert from "node:assert/strict";
import { mergeRowsById } from "../src/merge.js";

// A minimal, deterministic "row -> object" mapper standing in for the real
// rowToTx/rowToBill/rowToGoal in sync.js -- these tests only care about
// merge.js's own logic, not the field-mapping details of any one table.
const toObj = (r) => ({ id: r.id, updatedAt: new Date(r.updated_at).getTime(), value: r.value });

test("mergeRowsById: incoming row newer than local wins", () => {
  const local = [{ id: "1", updatedAt: 1000, value: "old" }];
  const incoming = [{ id: "1", updated_at: new Date(2000).toISOString(), value: "new", deleted: false }];
  const result = mergeRowsById(local, incoming, toObj);
  assert.equal(result.length, 1);
  assert.equal(result[0].value, "new");
  assert.equal(result[0].updatedAt, 2000);
});

test("mergeRowsById: local newer than incoming wins", () => {
  const local = [{ id: "1", updatedAt: 5000, value: "local-newer" }];
  const incoming = [{ id: "1", updated_at: new Date(1000).toISOString(), value: "stale", deleted: false }];
  const result = mergeRowsById(local, incoming, toObj);
  assert.equal(result.length, 1);
  assert.equal(result[0].value, "local-newer");
  assert.equal(result[0].updatedAt, 5000);
});

test("mergeRowsById: tombstone removes an existing row", () => {
  const local = [{ id: "1", updatedAt: 1000, value: "gone-soon" }];
  const incoming = [{ id: "1", updated_at: new Date(2000).toISOString(), deleted: true }];
  const result = mergeRowsById(local, incoming, toObj);
  assert.equal(result.length, 0);
});

test("mergeRowsById: tombstone for an unknown row is a no-op", () => {
  const local = [{ id: "1", updatedAt: 1000, value: "keep" }];
  const incoming = [{ id: "unknown", updated_at: new Date(2000).toISOString(), deleted: true }];
  const result = mergeRowsById(local, incoming, toObj);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "1");
});

test("mergeRowsById: row present in cloud but not locally gets added", () => {
  const local = [];
  const incoming = [{ id: "1", updated_at: new Date(1000).toISOString(), value: "from-cloud", deleted: false }];
  const result = mergeRowsById(local, incoming, toObj);
  assert.equal(result.length, 1);
  assert.equal(result[0].value, "from-cloud");
});

test("mergeRowsById: row present locally but not in cloud survives the merge", () => {
  const local = [{ id: "1", updatedAt: 1000, value: "local-only" }];
  const incoming = [];
  const result = mergeRowsById(local, incoming, toObj);
  assert.equal(result.length, 1);
  assert.equal(result[0].value, "local-only");
});

test("mergeRowsById: empty incoming array leaves local untouched", () => {
  const local = [{ id: "1", updatedAt: 1000, value: "a" }, { id: "2", updatedAt: 2000, value: "b" }];
  const result = mergeRowsById(local, [], toObj);
  assert.deepEqual(result, local);
});

test("mergeRowsById: incoming row with equal updatedAt does not overwrite local", () => {
  const local = [{ id: "1", updatedAt: 1000, value: "local" }];
  const incoming = [{ id: "1", updated_at: new Date(1000).toISOString(), value: "cloud", deleted: false }];
  const result = mergeRowsById(local, incoming, toObj);
  assert.equal(result[0].value, "local");
});

// mergeBudgetsByCategory (and its dedicated tests, formerly here) was
// removed once budgets gained a real categoryId -- see merge.js's own
// doc comment. Budgets now merge via the plain mergeRowsById above, same
// as bills/goals/categories; no separate test needed since it's the same
// function already covered by the tests above.
