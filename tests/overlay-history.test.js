import test from "node:test";
import assert from "node:assert/strict";

// overlay-history.js registers its popstate listener and reads window/history
// as globals at module load, so the stubs go on globalThis before a dynamic
// import() of it -- same reason tests/applock.test.js imports dynamically.
//
// The stub deliberately separates "queue a traversal" from "deliver the
// popstate": in a real browser history.back() returns immediately and the
// event arrives on a later task, so a test must be able to queue two
// traversals before either event fires. flushPops() is that later task.

const listeners = [];
const pushedStates = [];
// Entries the user accumulated before the app was opened. Starting above 1
// means a Back with the overlay stack empty still traverses and still
// delivers a popstate -- that is how a stuck suppression counter would show.
let entries = 4;
let pendingPops = 0;

globalThis.window = {
  addEventListener(type, fn) { if (type === "popstate") listeners.push(fn); }
};
globalThis.history = {
  pushState(state) { entries++; pushedStates.push(state); },
  back() {
    if (entries <= 1) return; // nowhere to go: no traversal, no popstate
    entries--;
    pendingPops++;
  }
};

function flushPops() {
  while (pendingPops > 0) {
    pendingPops--;
    for (const fn of listeners) fn();
  }
}

// A user pressing Back: the same traversal, just not initiated by the module.
function userBack() {
  globalThis.history.back();
  flushPops();
}

const { pushOverlayHistory, releaseOverlayHistory } =
  await import("../src/overlay-history.js");

test("pushOverlayHistory tags its entry and no-ops on a duplicate key", () => {
  const fired = [];
  const depthBefore = entries;
  assert.equal(pushOverlayHistory("dup", () => fired.push("dup")), true);
  assert.deepEqual(pushedStates.at(-1), { overlay: "dup" });
  assert.equal(pushOverlayHistory("dup", () => fired.push("dup2")), false);
  assert.equal(entries, depthBefore + 1); // the duplicate pushed nothing

  userBack();
  assert.deepEqual(fired, ["dup"]);
});

test("a user Back pops the top entry and fires its onPop (stack of one)", () => {
  const fired = [];
  pushOverlayHistory("solo", () => fired.push("solo"));
  userBack();
  assert.deepEqual(fired, ["solo"]);
  assert.equal(entries, 4);
});

test("a user Back closes the sheets one at a time (stack of two)", () => {
  const fired = [];
  pushOverlayHistory("A", () => fired.push("A"));
  pushOverlayHistory("B", () => fired.push("B"));

  userBack();
  assert.deepEqual(fired, ["B"]);
  userBack();
  assert.deepEqual(fired, ["B", "A"]);
  assert.equal(entries, 4);
});

test("releasing the top entry leaves the one below it open (WI-029)", () => {
  const fired = [];
  pushOverlayHistory("A", () => fired.push("A"));
  pushOverlayHistory("B", () => fired.push("B"));
  assert.equal(entries, 6);

  assert.equal(releaseOverlayHistory("B"), true);
  flushPops();
  assert.deepEqual(fired, []);   // A's onPop must not fire
  assert.equal(entries, 5);      // A's history entry is still there

  userBack();                    // and Back still closes A normally
  assert.deepEqual(fired, ["A"]);
  assert.equal(entries, 4);
});

test("a Back immediately after a non-Back dismissal is not swallowed", () => {
  const fired = [];
  pushOverlayHistory("sheet", () => fired.push("sheet"));
  releaseOverlayHistory("sheet"); // closed by its own button, not by Back
  flushPops();
  assert.deepEqual(fired, []);

  userBack();                     // user then backs out of the app itself
  assert.deepEqual(fired, []);    // nothing open, nothing to fire

  // The suppression drained: the next sheet's Back still closes it.
  pushOverlayHistory("next", () => fired.push("next"));
  userBack();
  assert.deepEqual(fired, ["next"]);
});

test("two releases in the same task leave no leftover suppression", () => {
  const fired = [];
  pushOverlayHistory("A", () => fired.push("A"));
  pushOverlayHistory("B", () => fired.push("B"));
  releaseOverlayHistory("B");
  releaseOverlayHistory("A");     // both traversals queued before either event
  flushPops();
  assert.deepEqual(fired, []);

  pushOverlayHistory("C", () => fired.push("C"));
  userBack();
  assert.deepEqual(fired, ["C"]); // a boolean guard would have eaten this
});

test("releaseOverlayHistory does nothing when key is not the top entry", () => {
  const fired = [];
  pushOverlayHistory("A", () => fired.push("A"));
  pushOverlayHistory("B", () => fired.push("B"));
  const depthBefore = entries;

  assert.equal(releaseOverlayHistory("A"), false);
  assert.equal(releaseOverlayHistory("nope"), false);
  assert.equal(entries, depthBefore); // no traversal queued
  assert.equal(pendingPops, 0);

  userBack();
  assert.deepEqual(fired, ["B"]);
  userBack();
  assert.deepEqual(fired, ["B", "A"]);
});

test("releaseOverlayHistory returns false on an empty stack", () => {
  assert.equal(releaseOverlayHistory("anything"), false);
  assert.equal(pendingPops, 0);
});
