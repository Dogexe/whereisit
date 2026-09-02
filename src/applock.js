// docs/specs/app-lock.md stage 1: a lightweight, purely client-side PIN
// gate on the app itself -- not a Supabase auth mechanism, not real
// security. Every function here is local-only: nothing in this module
// ever sends anything to Supabase or any other network endpoint.
//
// Deliberately pure/DOM-free (only state.js + storage.js's saveSettings,
// same as this codebase's other pure modules -- derived.js, merge.js,
// etc.) so it stays unit-testable in Node without a DOM stub. The lock
// screen's own overlay/focus-trap/visibility wiring lives in
// applock-ui.js instead, matching this codebase's established split
// between pure logic modules and screen/DOM modules -- see that file's
// own doc comment for why mixing the two here broke exactly that.
import { state } from "./state.js";
import { saveSettings } from "./storage.js";

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
// A fresh random salt per PIN (not reused across setPin() calls) rules out
// a precomputed rainbow-table lookup against the fixed 10,000-value
// 4-digit space -- cheap to add, even though the overall threat model here
// (see the spec) is "casual glance," not a determined attacker.
export function genSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}
// Salted SHA-256, not a KDF like PBKDF2/bcrypt -- see the spec's own
// decision on why a slow hash would be solving the wrong problem for a
// 4-digit convenience lock. Uses the browser/Node's native crypto.subtle
// (Web Crypto), no new dependency.
export async function hashPin(pin, salt) {
  const bytes = new TextEncoder().encode(salt + pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}
export async function setPin(pin) {
  const salt = genSalt();
  const hash = await hashPin(pin, salt);
  state.pinEnabled = true;
  state.pinHash = hash;
  state.pinSalt = salt;
  saveSettings();
}
// No constant-time compare -- a timing side-channel on a local 4-digit PIN
// check is a purely theoretical concern given this feature's own "not real
// security" framing (see the spec).
export async function verifyPin(pin) {
  if (!state.pinEnabled || !state.pinHash || !state.pinSalt) return false;
  const hash = await hashPin(pin, state.pinSalt);
  return hash === state.pinHash;
}
// The "forgot PIN" clear (and also what turning the Settings toggle off
// calls) -- just resets the three fields, no server round-trip, nothing
// to recover. Callers that need an Undo (Settings' toggle-off, the lock
// screen's "Forgot PIN?" link -- both per the spec) capture
// { pinEnabled, pinHash, pinSalt } themselves before calling this, and
// restore those three fields directly + saveSettings() again on Undo;
// that's simple enough not to need a dedicated snapshot/restore helper
// here.
export function clearPin() {
  state.pinEnabled = false;
  state.pinHash = null;
  state.pinSalt = null;
  saveSettings();
}
