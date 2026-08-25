import test from "node:test";
import assert from "node:assert/strict";
import { fetchAllPages } from "../src/paginate.js";

// A tiny page size makes these tests fast and readable without needing to
// construct 1000+ row fixtures; fetchAllPages takes pageSize as a param
// specifically so this doesn't have to touch the real PAGE_SIZE export.
const PAGE = 3;

function row(id, updatedAt) {
  return { id, updated_at: updatedAt };
}

// Simulates a live, ordered (by updated_at, id) data source over a
// *mutable* array: given a cursor (or null for the first page), returns
// the rows strictly after that (updatedAt, id) pair, sorted, sliced to
// `limit`. Because it re-derives from `rows` on every call rather than
// snapshotting once, mutating `rows` between calls (as a "concurrent
// write" test does) is visible to the next page fetch -- exactly like a
// real database query re-evaluated per request.
function makeSource(rows) {
  return async (cursor, limit) => {
    const sorted = rows.slice().sort((a, b) =>
      a.updated_at === b.updated_at ? (a.id < b.id ? -1 : 1) : (a.updated_at < b.updated_at ? -1 : 1));
    const after = cursor
      ? sorted.filter((r) => r.updated_at > cursor.updatedAt || (r.updated_at === cursor.updatedAt && r.id > cursor.id))
      : sorted;
    return { data: after.slice(0, limit), error: null };
  };
}

test("a single short page (fewer than pageSize rows) is the whole result", async () => {
  const fetchPage = async (cursor, limit) => {
    assert.equal(cursor, null);
    assert.equal(limit, PAGE);
    return { data: [row("r0", "t0"), row("r1", "t1")], error: null };
  };
  const { data, error } = await fetchAllPages(fetchPage, PAGE);
  assert.equal(error, null);
  assert.deepEqual(data.map((r) => r.id), ["r0", "r1"]);
});

test("exactly pageSize rows followed by an empty page stops after the empty page", async () => {
  const rows = Array.from({ length: PAGE }, (_, i) => row(`r${i}`, `t${i}`));
  const fetchPage = makeSource(rows);
  const { data, error } = await fetchAllPages(fetchPage, PAGE);
  assert.equal(error, null);
  assert.equal(data.length, PAGE);
});

test("multiple full pages then a partial page concatenates all of them in order", async () => {
  const rows = Array.from({ length: PAGE * 2 + 1 }, (_, i) => row(`r${i}`, `t${String(i).padStart(4, "0")}`));
  const fetchPage = makeSource(rows);
  const { data, error } = await fetchAllPages(fetchPage, PAGE);
  assert.equal(error, null);
  assert.equal(data.length, PAGE * 2 + 1);
  assert.deepEqual(data.map((r) => r.id), rows.map((r) => r.id));
});

test("rows sharing the exact same updated_at are not skipped or duplicated (id tiebreak)", async () => {
  // All five rows share one timestamp -- only `id` orders them.
  const rows = ["r2", "r0", "r4", "r1", "r3"].map((id) => row(id, "same-ts"));
  const fetchPage = makeSource(rows);
  const { data, error } = await fetchAllPages(fetchPage, PAGE);
  assert.equal(error, null);
  assert.deepEqual(data.map((r) => r.id), ["r0", "r1", "r2", "r3", "r4"]);
});

test("a row updated between page fetches (moving later in sort order) is not skipped", async () => {
  // 5 rows, page size 2: page 1 = [r0, r1]. Before page 2 is requested,
  // simulate a concurrent write on r2 that bumps it past every other row's
  // timestamp -- with offset pagination this would shift r3 into the slot
  // r2 vacated and cause page 2 (still reading from positional offset 2)
  // to skip whichever row now sits at the old boundary. Keyset pagination
  // anchors on r1's own (updated_at, id) instead of a position, so it
  // isn't affected by rows moving around elsewhere in the order.
  const rows = [row("r0", "t0"), row("r1", "t1"), row("r2", "t2"), row("r3", "t3"), row("r4", "t4")];
  let callCount = 0;
  const source = makeSource(rows);
  const fetchPage = async (cursor, limit) => {
    callCount++;
    if (callCount === 2) {
      const r2 = rows.find((r) => r.id === "r2");
      r2.updated_at = "t9"; // moves to the very end of the order
    }
    return source(cursor, limit);
  };
  const { data, error } = await fetchAllPages(fetchPage, PAGE);
  assert.equal(error, null);
  assert.deepEqual(new Set(data.map((r) => r.id)), new Set(["r0", "r1", "r2", "r3", "r4"]));
});

test("an error on page 2 stops fetching and returns null data, not a partial result", async () => {
  const calls = [];
  const fetchPage = async (cursor) => {
    calls.push(cursor);
    if (cursor === null) return { data: Array.from({ length: PAGE }, (_, i) => row(`r${i}`, `t${i}`)), error: null };
    return { data: null, error: new Error("network blip") };
  };
  const { data, error } = await fetchAllPages(fetchPage, PAGE);
  assert.ok(error);
  assert.equal(data, null);
  assert.equal(calls.length, 2);
});
