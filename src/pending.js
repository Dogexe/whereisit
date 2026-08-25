// Tracks records that still need pushing to Supabase: rows created, edited,
// or deleted locally whose most recent push attempt hasn't yet succeeded.
// syncNow() pushes only these instead of resending the whole table every
// cycle -- pushRows() (in sync.js) marks a row pending the moment it's
// asked to push it, and clears it only once the network call actually
// confirms success.
//
// Stores the *row itself* (the exact upsert-ready payload pushRows would
// send), not just a bare id. A deleted record is removed from the live
// transactions/budgets/bills/goals arrays immediately (see deleteTx and
// friends), so by the time a retry runs there is no live object left to
// rebuild a tombstone row from -- keeping the row means a delete's
// tombstone survives its own record's removal from local state, and a
// retry is a byte-for-byte replay of what needed to go out rather than a
// reconstruction from state that may have moved on since.
//
// Persisted to localStorage so pending edits made while offline (or before
// ever signing in) survive closing the app and still get retried on next
// launch. Unlike storage.js's saveToStorage/saveSettings, a persist failure
// here doesn't show a toast -- the real data (the transaction/budget/etc
// itself) is already safe in the main STORAGE_KEY/SETTINGS_KEY writes, so
// worst case here is a missed retry until the next successful mark, not
// data loss.

const PENDING_KEY = "expense_tracker_pending_v1";
const TABLES = ["transactions", "budgets", "bills", "goals"];

const pending = { transactions: new Map(), budgets: new Map(), bills: new Map(), goals: new Map() };

function persist() {
  try {
    const obj = {};
    TABLES.forEach((t) => { obj[t] = Array.from(pending[t].values()); });
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(obj));
  } catch (e) { /* best-effort, see file header */ }
}

export function loadPending() {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    TABLES.forEach((t) => {
      if (Array.isArray(obj[t])) pending[t] = new Map(obj[t].map((row) => [row.id, row]));
    });
  } catch (e) { /* ignore corrupt data, start with nothing pending */ }
}

export function markPending(table, rows) {
  if (!rows.length) return;
  rows.forEach((row) => pending[table].set(row.id, row));
  persist();
}

export function clearPending(table, ids) {
  if (!ids.length) return;
  let changed = false;
  ids.forEach((id) => { if (pending[table].delete(id)) changed = true; });
  if (changed) persist();
}

export function getPendingRows(table) {
  return Array.from(pending[table].values());
}
