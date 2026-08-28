import { CATEGORIES } from "./categories.js";
import { $, escapeHtml } from "./utils.js";
import { state, transactions, budgets, bills, goals, setTransactions, setBudgets, setBills, setGoals } from "./state.js";
import { saveToStorage, saveSettings } from "./storage.js";
import { L } from "./i18n.js";
import { showToast } from "./toast.js";
import { mergeRowsById, mergeBudgetsByCategory } from "./merge.js";
import { markPending, clearPending, getPendingRows, clearAllPending } from "./pending.js";
import { getWatermark, advanceWatermark, resetWatermark } from "./watermark.js";
import { fetchAllPages } from "./paginate.js";

// Set once by main.js at boot (see setSyncRerenderCallback) -- avoids sync.js
// importing renderScreen from main.js, which would make the two modules
// depend on each other circularly.
let onSyncRerender = () => {};
export function setSyncRerenderCallback(fn) { onSyncRerender = fn; }
export const SUPABASE_URL = "https://kbpnolgucodpiglarsoj.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticG5vbGd1Y29kcGlnbGFyc29qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NDkzOTYsImV4cCI6MjEwMjQyNTM5Nn0.mDSJ8msVCVpWRntJTm6hN3etKKm1cq2R3AGhRlX-V0A";
export let sb = null;
try {
  if (window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) { sb = null; }

export let currentUser = null;
// Bumped by setCurrentUser() (bottom of file) whenever the signed-in
// identity actually changes -- see its own doc comment, and the pull*
// functions' shared doc comment below, for what this guards against.
let syncEpoch = 0;
export let lastSyncStatus = { text: "", ok: null };

export function setSyncStatus(text, ok) {
  lastSyncStatus = { text, ok };
  const el = $("syncStatus");
  if (!el) return;
  el.className = ok === true ? "ok" : (ok === false ? "err" : "");
  el.innerHTML = '<span class="sync-dot"></span><span>' + escapeHtml(text) + "</span>";
}

function rowToTx(r) {
  return { id: r.id, type: r.type, date: r.tx_date, category: r.category, amount: Number(r.amount), note: r.note || "", updatedAt: new Date(r.updated_at).getTime() };
}
function txToRow(t, deleted) {
  return {
    id: t.id, user_id: currentUser ? currentUser.id : null, type: t.type, tx_date: t.date, category: t.category,
    amount: t.amount, note: t.note || "", deleted: !!deleted,
    updated_at: new Date(t.updatedAt || Date.now()).toISOString()
  };
}
function budgetRowToObj(r) { return { id: r.id, category: r.category, limit: Number(r.limit_amount), updatedAt: new Date(r.updated_at).getTime() }; }
export function budgetToRow(b, deleted) {
  return {
    id: b.id, user_id: currentUser ? currentUser.id : null, category: b.category, limit_amount: b.limit,
    deleted: !!deleted, updated_at: new Date(b.updatedAt || Date.now()).toISOString()
  };
}
function rowToBill(r) { return { id: r.id, name: r.name, amount: Number(r.amount), day: r.day, category: r.category || CATEGORIES.expense[CATEGORIES.expense.length - 1], lastPaidCycle: r.last_paid_cycle || null, updatedAt: new Date(r.updated_at).getTime() }; }
export function billToRow(b, deleted) {
  return {
    id: b.id, user_id: currentUser ? currentUser.id : null, name: b.name, amount: b.amount, day: b.day,
    category: b.category || CATEGORIES.expense[CATEGORIES.expense.length - 1], last_paid_cycle: b.lastPaidCycle || null,
    deleted: !!deleted, updated_at: new Date(b.updatedAt || Date.now()).toISOString()
  };
}
function rowToGoal(r) { return { id: r.id, name: r.name, target: Number(r.target_amount), saved: Number(r.saved_amount), updatedAt: new Date(r.updated_at).getTime() }; }
export function goalToRow(g, deleted) {
  return {
    id: g.id, user_id: currentUser ? currentUser.id : null, name: g.name, target_amount: g.target, saved_amount: g.saved,
    deleted: !!deleted, updated_at: new Date(g.updatedAt || Date.now()).toISOString()
  };
}

// Marks every row pending the moment a push is attempted -- before the
// !sb/!currentUser checks below, so an edit made while signed out or before
// the Supabase client is ready is still queued for the next successful
// sign-in's markAllPending() sweep -- and clears each id only once the
// network call actually confirms success. This is where the boolean this
// function returns gets consumed for real, rather than discarded like every
// call site used to do.
//
// Sent in chunks of PUSH_CHUNK_SIZE rather than one upsert: markAllPending()
// on a device with thousands of records would otherwise build a single
// request large enough to risk exceeding a payload size limit. Pending is
// cleared per chunk as each one confirms, via the same reference-equality
// clearPending() as everywhere else -- not once at the end -- so a failure
// partway through (e.g. chunk 4 of 7) leaves the chunks that already
// succeeded (1-3) cleared and everything from the failure point on (4-7)
// still pending; the loop stops at the first failure rather than pressing
// on with later chunks, since those later rows are already sitting
// correctly-marked in the pending map from the markPending() call above
// and will simply retry on the next cycle.
const PUSH_CHUNK_SIZE = 500;
export async function pushRows(table, rows) {
  if (!rows.length) return true;
  markPending(table, rows);
  if (!sb || !currentUser) return true;
  for (let i = 0; i < rows.length; i += PUSH_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + PUSH_CHUNK_SIZE);
    try {
      const { error } = await sb.from(table).upsert(chunk);
      if (error) throw error;
      clearPending(table, chunk);
    } catch (e) { return false; }
  }
  return true;
}
export async function pushTx(t) { return pushRows("transactions", [txToRow(t, false)]); }
export async function pushDeleteTx(t) { return pushRows("transactions", [txToRow(t, true)]); }

// Called once from main.js's auth listener on a genuine new sign-in (the
// SIGNED_IN event, not a page-load session restore) -- a fresh or
// long-offline device needs exactly one full upload of everything it
// currently has locally, not a resend every 25s once that's done.
export function markAllPending() {
  markPending("transactions", transactions.map((t) => txToRow(t, false)));
  markPending("budgets", budgets.map((b) => budgetToRow(b, false)));
  markPending("bills", bills.map((b) => billToRow(b, false)));
  markPending("goals", goals.map((g) => goalToRow(g, false)));
}

// Clears everything scoped to the signed-in account -- transactions,
// budgets, bills, goals, the pending upload queue, and the pull watermark
// -- from both memory and localStorage. Called from main.js's auth
// listener on SIGNED_OUT (the clean case) and on SIGNED_IN when
// account.js's shouldWipeLocalData() finds a *different* account signing
// in on this device (the safety net for when SIGNED_OUT never fired
// cleanly -- app closed mid-session, an expired token, sign-in arriving
// via a different flow). Without this, the outgoing account's still-loaded
// local data would get marked pending by markAllPending() and uploaded
// into the new account.
//
// Deliberately leaves state.lang/state.dark untouched: those are device
// preferences, not account data, and must survive a sign-out. Clearing the
// in-memory budgets/bills/goals arrays first and then calling
// saveSettings() persists lang/dark unchanged alongside the now-empty
// arrays in the same write, rather than needing a separate
// settings-preserving code path.
export function wipeLocalAccountData() {
  setTransactions([]);
  setBudgets([]);
  setBills([]);
  setGoals([]);
  saveToStorage();
  saveSettings();
  clearAllPending();
  resetWatermark();
}

// A pull's tombstone can remove a local record that still has an uncleared
// (failed-to-push) pending create/edit sitting in the pending map from
// before the pull ran -- e.g. an edit that failed to push while offline,
// followed by another device deleting that same record before this device
// came back online. mergeRowsById makes an incoming tombstone always win
// over a local record regardless of timestamp, so once the pull above has
// removed the id from the live array, the stale pending entry must be
// dropped too -- otherwise the push phase right after would resurrect a row
// another device already deleted, both locally on the next pull elsewhere
// and in the cloud. Budgets don't need this: pullBudgets/
// mergeBudgetsByCategory never actually removes a row on a tombstone (see
// its own doc comment), so a pending budget entry can't go stale this way.
function dropPendingForRemovedIds(table, liveArray) {
  const liveIds = new Set(liveArray.map((x) => x.id));
  const stale = getPendingRows(table).filter((r) => !r.deleted && !liveIds.has(r.id));
  clearPending(table, stale);
}

// Filters a pull to rows changed since the last-seen watermark for that
// table, when one exists; a table with no watermark yet gets an unfiltered
// full pull (see watermark.js). A tombstone is just a row with
// deleted:true and a fresh updated_at (txToRow/budgetToRow/billToRow/
// goalToRow always stamp deletes with Date.now() at delete time -- see
// deleteTx and friends), so it satisfies this same filter exactly like any
// other change and still arrives.
//
// Uses .gte(), not .gt(): updated_at is a client-supplied millisecond
// timestamp (Date.now()), so two different writes landing in the same
// millisecond -- unlikely but real, e.g. two devices pushing at once --
// can share the exact value the watermark just advanced to. A strict .gt()
// would then permanently exclude the later of the two from every future
// pull, a silent, unrecoverable miss (worse for a tombstone: the deleted
// record would never get removed elsewhere). .gte() means the row(s)
// already at the boundary get re-fetched every cycle once any data exists,
// but that's harmless: mergeRowsById/mergeBudgetsByCategory only overwrite
// on a strictly newer updatedAt, so re-receiving an already-merged row is a
// no-op. Trading a few redundant bytes for never silently dropping a row.
//
// Ordered by updated_at then id, both ascending: keyset pagination below
// requires a stable total order to anchor its cursor on, and updated_at
// alone isn't one -- two rows can share the exact same client-supplied
// millisecond timestamp (the same reason .gte() above exists). `id` is
// unique per row, so (updated_at, id) always is a total order regardless
// of how many rows share a timestamp.
function watermarkedQuery(table) {
  let q = sb.from(table).select("*").eq("user_id", currentUser.id)
    .order("updated_at", { ascending: true }).order("id", { ascending: true });
  const wm = getWatermark(table);
  if (wm) q = q.gte("updated_at", wm);
  return q;
}

// Supabase caps a single select() at its project's max-rows setting
// (dashboard default: 1000) and returns no error when it silently
// truncates (see paginate.js) -- fetchAllPages pages through PAGE_SIZE
// rows at a time until a short page signals the end, so a table with more
// than PAGE_SIZE matching rows (most likely on a fresh device's very
// first pull) still gets everything instead of an arbitrary subset that
// would then wrongly advance the watermark past whatever didn't fit in
// that subset.
//
// Uses keyset (cursor) pagination, not .range(offset, ...): see
// paginate.js's own doc comment for why offset pagination is unsafe here
// specifically (a concurrent write during a multi-page fetch can shift
// positions and silently skip a row). `.or()` builds the standard
// "strictly after this (updated_at, id) pair" composite filter -- greater
// updated_at, OR equal updated_at with a greater id as the tiebreaker --
// which stays correct regardless of what else changes in the table while
// this pull is still in progress.
function pullAllPages(table) {
  return fetchAllPages((cursor, limit) => {
    let q = watermarkedQuery(table).limit(limit);
    if (cursor) {
      q = q.or(`updated_at.gt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`);
    }
    return q;
  });
}

// Every pull* function takes the syncEpoch value captured at the *start*
// of the syncNow() call that's driving it (see syncNow below), and
// rechecks it against the live syncEpoch immediately after its network
// call resolves, before touching any local state. setCurrentUser() bumps
// syncEpoch whenever the signed-in account's identity actually changes
// (sign-out, or a different account signing in) -- so if that happened
// while this pull was in flight, the epoch check fails and the result is
// discarded instead of being merged into (now a different account's)
// local state. Without this, a pull started for account A that resolves
// *after* account B has signed in (and wipeLocalAccountData() has already
// run) would call setTransactions()/setBudgets()/etc and silently
// repopulate B's local state with A's data -- a leak this whole feature
// exists to prevent, just arriving through the pull side instead of the
// push side. (The push side doesn't need this same guard: every pushed
// row already carries its own user_id, and this project's RLS policies
// enforce auth.uid() = user_id server-side, so a stale push under a
// mismatched account is rejected by Postgres regardless of anything this
// client does.)
async function pullTransactions(epoch) {
  if (!sb || !currentUser) return false;
  try {
    const { data, error } = await pullAllPages("transactions");
    if (error) throw error;
    if (epoch !== syncEpoch) return false;
    setTransactions(mergeRowsById(transactions, data, rowToTx));
    saveToStorage();
    advanceWatermark("transactions", data);
    return true;
  } catch (e) { return false; }
}
async function pullBudgets(epoch) {
  if (!sb || !currentUser) return false;
  try {
    const { data, error } = await pullAllPages("budgets");
    if (error) throw error;
    if (epoch !== syncEpoch) return false;
    // Matches the original: an empty result (now also the steady-state
    // case once the watermark has caught up, not just a genuinely empty
    // cloud table) skips the merge (and the localStorage write) entirely
    // rather than calling saveSettings() with an unchanged array -- see
    // mergeBudgetsByCategory's own doc comment for why this whole
    // function's shape is a preserved quirk, not a fix. `data` here is
    // already the combined result across every page, not just the first,
    // so this check is correct even when budgets spans multiple pages.
    if (!data || !data.length) return true;
    setBudgets(mergeBudgetsByCategory(budgets, data, budgetRowToObj));
    saveSettings();
    advanceWatermark("budgets", data);
    return true;
  } catch (e) { return false; }
}
async function pullBills(epoch) {
  if (!sb || !currentUser) return false;
  try {
    const { data, error } = await pullAllPages("bills");
    if (error) throw error;
    if (epoch !== syncEpoch) return false;
    setBills(mergeRowsById(bills, data, rowToBill));
    saveSettings();
    advanceWatermark("bills", data);
    return true;
  } catch (e) { return false; }
}
async function pullGoals(epoch) {
  if (!sb || !currentUser) return false;
  try {
    const { data, error } = await pullAllPages("goals");
    if (error) throw error;
    if (epoch !== syncEpoch) return false;
    setGoals(mergeRowsById(goals, data, rowToGoal));
    saveSettings();
    advanceWatermark("goals", data);
    return true;
  } catch (e) { return false; }
}

// True while the user has an uncontrolled form open/focused that a full
// screen re-render would silently reset mid-edit (Add screen, budget/bill
// inline forms, or any focused field in the current screen).
export function hasLiveInputRisk() {
  if (state.tab === "add") return true;
  if (state.budgetEditId || state.billEditId || state.goalEditId || state.goalContributeId) return true;
  const active = document.activeElement;
  const screenEl = $("screen");
  if (active && screenEl && screenEl.contains(active) && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName)) return true;
  return false;
}

// Tracks whether the last genuine sync attempt (online, signed in, actually
// reached the push/pull calls) failed, so a failure toast fires once when
// sync *starts* failing rather than on every 25s retry while it stays down.
let lastSyncFailed = false;
let syncInFlight = false;
export async function syncNow() {
  if (!sb) { setSyncStatus("cloud sync unavailable", false); return; }
  if (!currentUser) { setSyncStatus(L().syncSignedOut, null); return; }
  if (syncInFlight) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    setSyncStatus(L().syncOffline, false);
    return;
  }
  syncInFlight = true;
  setSyncStatus(L().syncSyncing, null);
  // Captured once, passed to every pull* call below -- see their shared
  // doc comment for why (discarding a pull's result if the signed-in
  // account changed while it was in flight).
  const epoch = syncEpoch;
  // Pull first: a device/session that hasn't yet learned about a deletion
  // made elsewhere still holds the old (or hardcoded default) row locally.
  // Pushing that stale copy before pulling would re-upload it with a fresh
  // timestamp and silently resurrect it in the cloud (and everywhere else).
  const pullTxOk = await pullTransactions(epoch);
  dropPendingForRemovedIds("transactions", transactions);
  const pullBudgetOk = await pullBudgets(epoch);
  const pullBillOk = await pullBills(epoch);
  dropPendingForRemovedIds("bills", bills);
  const pullGoalOk = await pullGoals(epoch);
  dropPendingForRemovedIds("goals", goals);
  // Every individual create/edit/delete already pushed its own single row
  // immediately (see pushTx/pushRows calls throughout the screens/ modules)
  // -- this is a retry pass for whatever's still pending because that push
  // never happened or failed (offline, not signed in yet, a transient
  // error), not a resend of the entire table. In the normal case each of
  // these four arrays is empty and pushRows's own `if (!rows.length) return
  // true` guard means this makes zero network calls.
  const pushTxOk = await pushRows("transactions", getPendingRows("transactions"));
  const pushBudgetOk = await pushRows("budgets", getPendingRows("budgets"));
  const pushBillOk = await pushRows("bills", getPendingRows("bills"));
  const pushGoalOk = await pushRows("goals", getPendingRows("goals"));
  if (pushTxOk && pushBudgetOk && pushBillOk && pushGoalOk && pullTxOk && pullBudgetOk && pullBillOk && pullGoalOk) {
    setSyncStatus(L().syncLatest + new Date().toLocaleTimeString(state.lang === "en" ? "en-US" : "th-TH"), true);
    lastSyncFailed = false;
    if (!hasLiveInputRisk()) onSyncRerender();
  } else {
    setSyncStatus(L().syncPartial, false);
    if (!lastSyncFailed) showToast(L().syncPartial);
    lastSyncFailed = true;
  }
  syncInFlight = false;
}

export async function signInWithGoogle() {
  if (!sb) return;
  try {
    const cleanUrl = window.location.origin + window.location.pathname;
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: cleanUrl } });
    if (error) throw error;
  } catch (e) {
    showToast(L().toastSignInFailed);
  }
}
export async function signOutUser() {
  if (!sb) return;
  try {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  } catch (e) {
    showToast(L().toastSignOutFailed);
  }
}

// Reassigning an imported `let` binding from another module isn't allowed in
// ES modules (only mutation is) -- main.js's auth-state-change listener calls
// this instead of assigning `currentUser` directly.
//
// Bumps syncEpoch whenever the signed-in identity actually changes (a
// sign-out, or a different account signing in) -- but not on a same-account
// token refresh, which calls this too with an unchanged id.
export function setCurrentUser(user) {
  const newId = user ? user.id : null;
  const oldId = currentUser ? currentUser.id : null;
  if (newId !== oldId) syncEpoch++;
  currentUser = user;
}
