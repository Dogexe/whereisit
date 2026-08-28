// Decides whether a saved array from localStorage should replace a
// module's hardcoded default, or fall back to that default. Pulled out as
// its own pure function (rather than an inline `&&` condition per field in
// storage.js) because the naive version -- `Array.isArray(saved) &&
// saved.length` -- treats a legitimately-saved *empty* array the same as
// "never saved," silently resurrecting the default. That's wrong: an
// empty array was still saved, it should stay empty.
//
// `Array.isArray` alone is the correct way to tell "never saved" (or
// corrupt/non-array data) apart from "saved, and happens to be empty" --
// saveSettings() (storage.js) always writes budgets/bills/goals as actual
// arrays, so a missing key (a first-ever run, or a save from before a
// field existed) is the only case that legitimately falls through to
// `fallback`.
export function restoreArray(saved, fallback) {
  return Array.isArray(saved) ? saved : fallback;
}
