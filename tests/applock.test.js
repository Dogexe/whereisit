import test from "node:test";
import assert from "node:assert/strict";

// docs/specs/app-lock.md stage 1. Same reasoning as tests/pending.test.js:
// storage.js reads window.localStorage at module load (to determine
// storageAvailable) and again inside saveSettings(), so a minimal
// in-memory stub installed before import is enough -- no jsdom needed.
// crypto.subtle/crypto.getRandomValues are used as globals, no stub
// needed -- Node's own Web Crypto implementation provides both.
function makeFakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
}
globalThis.window = { localStorage: makeFakeLocalStorage() };

const { state } = await import("../src/state.js");
const { genSalt, hashPin, setPin, verifyPin, clearPin } = await import("../src/applock.js");

test("genSalt: returns a non-empty hex string, different each call", () => {
  const a = genSalt(), b = genSalt();
  assert.match(a, /^[0-9a-f]+$/);
  assert.notEqual(a, b);
});

test("hashPin: deterministic for the same salt+PIN", async () => {
  const h1 = await hashPin("1234", "abcd");
  const h2 = await hashPin("1234", "abcd");
  assert.equal(h1, h2);
});

test("hashPin: a different salt produces a different hash for the same PIN", async () => {
  const h1 = await hashPin("1234", "salt-a");
  const h2 = await hashPin("1234", "salt-b");
  assert.notEqual(h1, h2);
});

test("hashPin: a different PIN produces a different hash for the same salt", async () => {
  const h1 = await hashPin("1234", "abcd");
  const h2 = await hashPin("4321", "abcd");
  assert.notEqual(h1, h2);
});

test("setPin then verifyPin: round-trips correctly for the right PIN", async () => {
  await setPin("1234");
  assert.equal(state.pinEnabled, true);
  assert.equal(await verifyPin("1234"), true);
});

test("verifyPin: rejects a wrong PIN", async () => {
  await setPin("1234");
  assert.equal(await verifyPin("9999"), false);
});

test("verifyPin: false when no PIN has been set", () => {
  clearPin();
  return verifyPin("1234").then((result) => assert.equal(result, false));
});

test("clearPin: resets pinEnabled/pinHash/pinSalt to their off state", async () => {
  await setPin("1234");
  clearPin();
  assert.equal(state.pinEnabled, false);
  assert.equal(state.pinHash, null);
  assert.equal(state.pinSalt, null);
});
