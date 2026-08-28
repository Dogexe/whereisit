import test from "node:test";
import assert from "node:assert/strict";
import { restoreArray } from "../src/restore.js";

test("restoreArray: saved array with items -> use it", () => {
  assert.deepEqual(restoreArray([{ id: "a" }], [{ id: "default" }]), [{ id: "a" }]);
});

test("restoreArray: saved empty array -> use it (empty), not the fallback", () => {
  assert.deepEqual(restoreArray([], [{ id: "default" }]), []);
});

test("restoreArray: undefined (never saved) -> fallback", () => {
  assert.deepEqual(restoreArray(undefined, [{ id: "default" }]), [{ id: "default" }]);
});

test("restoreArray: non-array junk -> fallback", () => {
  assert.deepEqual(restoreArray("not-an-array", [{ id: "default" }]), [{ id: "default" }]);
  assert.deepEqual(restoreArray(null, [{ id: "default" }]), [{ id: "default" }]);
  assert.deepEqual(restoreArray(42, [{ id: "default" }]), [{ id: "default" }]);
});
