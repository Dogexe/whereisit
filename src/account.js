// Tracks which account's data currently occupies local storage, so a
// different Google account signing in on this device doesn't have the
// previous account's still-loaded local data silently uploaded into it.
// Deliberately a plain localStorage-backed leaf module (no imports from
// state.js/sync.js/pending.js/etc.) so shouldWipeLocalData -- the actual
// decision -- stays pure and unit-testable without any of that machinery.

const ACCOUNT_KEY = "expense_tracker_account_v1";

// Should a sign-in as `incomingUserId` wipe whatever account data is
// currently local on this device? Only when a *different* account was
// previously here. No stored id at all is the anonymous-use-then-sign-in
// case -- uploading the existing local data into the newly signed-in
// account there is the correct, intended migration, not a leak, so this
// must NOT wipe. A missing incoming id (shouldn't normally happen for a
// SIGNED_IN event, but keeps this a total function) also never wipes --
// there's no new account whose data needs protecting from the old.
export function shouldWipeLocalData(storedUserId, incomingUserId) {
  if (!storedUserId || !incomingUserId) return false;
  return storedUserId !== incomingUserId;
}

export function getStoredUserId() {
  try { return window.localStorage.getItem(ACCOUNT_KEY); } catch (e) { return null; }
}

export function setStoredUserId(id) {
  try {
    if (id) window.localStorage.setItem(ACCOUNT_KEY, id);
    else window.localStorage.removeItem(ACCOUNT_KEY);
  } catch (e) { /* best-effort: worst case the next sign-in's mismatch
    check is skipped once, not data loss */ }
}
