import test from "node:test";
import assert from "node:assert/strict";
import { fetchAllPages } from "../src/paginate.js";

// A tiny page size makes these tests fast and readable without needing to
// construct 1000+ row fixtures; fetchAllPages takes pageSize as a param
// specifically so this doesn't have to touch the real PAGE_SIZE export.
const PAGE = 3;

function rowsFrom(startId, count) {
  return Array.from({ length: count }, (_, i) => ({ id: `r${startId + i}` }));
}

test("a single short page (fewer than pageSize rows) is the whole result", async () => {
  const fetchPage = async (offset, limit) => {
    assert.equal(offset, 0);
    assert.equal(limit, PAGE);
    return { data: rowsFrom(0, 2), error: null };
  };
  const { data, error } = await fetchAllPages(fetchPage, PAGE);
  assert.equal(error, null);
  assert.deepEqual(data.map((r) => r.id), ["r0", "r1"]);
});

test("exactly pageSize rows followed by an empty page stops after the empty page", async () => {
  const calls = [];
  const fetchPage = async (offset, limit) => {
    calls.push(offset);
    if (offset === 0) return { data: rowsFrom(0, PAGE), error: null };
    return { data: [], error: null };
  };
  const { data, error } = await fetchAllPages(fetchPage, PAGE);
  assert.equal(error, null);
  assert.equal(data.length, PAGE);
  assert.deepEqual(calls, [0, PAGE]);
});

test("multiple full pages then a partial page concatenates all of them in order", async () => {
  const pages = [rowsFrom(0, PAGE), rowsFrom(PAGE, PAGE), rowsFrom(PAGE * 2, 1)];
  const fetchPage = async (offset) => {
    const pageIndex = offset / PAGE;
    return { data: pages[pageIndex] || [], error: null };
  };
  const { data, error } = await fetchAllPages(fetchPage, PAGE);
  assert.equal(error, null);
  assert.equal(data.length, PAGE * 2 + 1);
  assert.deepEqual(data.map((r) => r.id), [
    ...rowsFrom(0, PAGE), ...rowsFrom(PAGE, PAGE), ...rowsFrom(PAGE * 2, 1)
  ].map((r) => r.id));
});

test("an error on page 2 stops fetching and returns null data, not a partial result", async () => {
  const calls = [];
  const fetchPage = async (offset) => {
    calls.push(offset);
    if (offset === 0) return { data: rowsFrom(0, PAGE), error: null };
    return { data: null, error: new Error("network blip") };
  };
  const { data, error } = await fetchAllPages(fetchPage, PAGE);
  assert.ok(error);
  assert.equal(data, null);
  // Never attempted a third page after the failure.
  assert.deepEqual(calls, [0, PAGE]);
});
