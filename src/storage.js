import { state, transactions, budgets, bills, goals, categories, accounts, setTransactions, setBudgets, setBills, setGoals, setCategories, setAccounts } from "./state.js";
import { showToast } from "./toast.js";
import { L } from "./i18n.js";
import { restoreArray } from "./restore.js";

export const STORAGE_KEY = "expense_tracker_transactions_v1";
export const SETTINGS_KEY = "expense_tracker_settings_v1";
export let storageAvailable = false;
(function testStorage() {
  try {
    window.localStorage.setItem("__t__", "1");
    window.localStorage.removeItem("__t__");
    storageAvailable = true;
  } catch (e) { storageAvailable = false; }
})();
export function loadFromStorage() {
  if (!storageAvailable) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        setTransactions(data);
        transactions.forEach((t) => { if (!t.updatedAt) t.updatedAt = Date.now(); });
      }
    }
  } catch (e) { /* ignore corrupt data */ }
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.lang === "th" || s.lang === "en") state.lang = s.lang;
      if (typeof s.dark === "boolean") state.dark = s.dark;
      if (typeof s.hideAmounts === "boolean") state.hideAmounts = s.hideAmounts;
      // docs/specs/app-lock.md stage 1: pinHash/pinSalt only mean anything
      // together with pinEnabled, so all three are restored as one unit --
      // a corrupt/partial write (e.g. pinHash present but pinEnabled
      // missing) falls back to "PIN off" entirely rather than a broken
      // half-state that could lock the app with no way to verify.
      if (typeof s.pinEnabled === "boolean") {
        state.pinEnabled = s.pinEnabled;
        state.pinHash = typeof s.pinHash === "string" ? s.pinHash : null;
        state.pinSalt = typeof s.pinSalt === "string" ? s.pinSalt : null;
      }
      // A saved *empty* array must win over the hardcoded defaults -- the
      // user deleted their last budget/bill/goal on purpose. Only a
      // missing key (no prior save) falls back to state.js's defaults; see
      // restore.js for why Array.isArray alone is the right check here.
      setBudgets(restoreArray(s.budgets, budgets));
      setBills(restoreArray(s.bills, bills));
      setGoals(restoreArray(s.goals, goals));
      setCategories(restoreArray(s.categories, categories));
      setAccounts(restoreArray(s.accounts, accounts));
    }
  } catch (e) { /* ignore */ }
}
// Fires at most once per session: storageAvailable is set once at module
// load and effectively never changes, so warning on every save attempt
// after the first would just spam the same message on every add/edit/delete.
let warnedUnavailable = false;
function warnUnavailable() {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  showToast(L().toastStorageUnavailable);
}
// The toast this shows on failure is deferred to a microtask rather than
// shown synchronously here, because callers don't have a consistent order
// (some show their own "saved"/"added" toast before calling this, some
// after) -- a synchronous call here could get silently overwritten by a
// caller's success toast that fires right after. Deferring guarantees this
// one is always the last to run, so it's the one the user actually sees.
export function saveToStorage() {
  if (!storageAvailable) { warnUnavailable(); return; }
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); }
  catch (e) { queueMicrotask(() => showToast(L().toastSaveFailed)); }
}
export function saveSettings() {
  if (!storageAvailable) { warnUnavailable(); return; }
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      lang: state.lang, dark: state.dark, hideAmounts: state.hideAmounts,
      pinEnabled: state.pinEnabled, pinHash: state.pinHash, pinSalt: state.pinSalt,
      budgets, bills, goals, categories, accounts
    }));
  }
  catch (e) { queueMicrotask(() => showToast(L().toastSaveFailed)); }
}
