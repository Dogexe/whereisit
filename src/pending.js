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
const TABLES = ["transactions", "budgets", "bills", "goals", "categories"];

const pending = { transactions: new Map(), budgets: new Map(), bills: new Map(), goals: new Map(), categories: new Map() };

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

// Takes the actual row objects that were just confirmed pushed (the same
// shape markPending takes), not bare ids -- and only removes a table's
// pending entry for a row's id if the map still holds that *exact* object
// (reference equality). This matters when two pushes for the same id
// overlap: edit X (push A starts, marking A pending) then edit X again
// before A resolves (push B starts, overwriting the map entry with B). If A
// then resolves successfully first, clearing by id alone would wipe out B's
// still-unconfirmed entry even though B never actually reached the network
// -- reference equality means A's success can only ever clear A's own
// entry, leaving B correctly pending for the next retry.
export function clearPending(table, rows) {
  if (!rows.length) return;
  let changed = false;
  rows.forEach((row) => {
    if (pending[table].get(row.id) === row) { pending[table].delete(row.id); changed = true; }
  });
  if (changed) persist();
}

export function getPendingRows(table) {
  return Array.from(pending[table].values());
}

// Wipes every table's pending queue outright -- used when local account
// data itself is being wiped (a sign-out, or a different account signing
// in on this device), where a queued upload of the outgoing account's data
// would be exactly the leak that wipe exists to prevent.
export function clearAllPending() {
  TABLES.forEach((t) => { pending[t] = new Map(); });
  persist();
}
