import { CATEGORIES } from "./categories.js";
import { $, escapeHtml } from "./utils.js";
import { state, transactions, budgets, bills, goals, setTransactions, setBudgets, setBills, setGoals } from "./state.js";
import { saveToStorage, saveSettings } from "./storage.js";
import { L } from "./i18n.js";
import { showToast } from "./toast.js";
import { mergeRowsById, mergeBudgetsByCategory } from "./merge.js";

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

export async function pushRows(table, rows) {
  if (!sb || !currentUser || !rows.length) return true;
  try {
    const { error } = await sb.from(table).upsert(rows);
    if (error) throw error;
    return true;
  } catch (e) { return false; }
}
export async function pushTx(t) { return pushRows("transactions", [txToRow(t, false)]); }
export async function pushDeleteTx(t) { return pushRows("transactions", [txToRow(t, true)]); }

async function pullTransactions() {
  if (!sb || !currentUser) return false;
  try {
    const { data, error } = await sb.from("transactions").select("*").eq("user_id", currentUser.id);
    if (error) throw error;
    setTransactions(mergeRowsById(transactions, data, rowToTx));
    saveToStorage();
    return true;
  } catch (e) { return false; }
}
async function pullBudgets() {
  if (!sb || !currentUser) return false;
  try {
    const { data, error } = await sb.from("budgets").select("*").eq("user_id", currentUser.id);
    if (error) throw error;
    // Matches the original: an empty cloud result skips the merge (and the
    // localStorage write) entirely rather than calling saveSettings() with
    // an unchanged array -- see mergeBudgetsByCategory's own doc comment for
    // why this whole function's shape is a preserved quirk, not a fix.
    if (!data || !data.length) return true;
    setBudgets(mergeBudgetsByCategory(budgets, data, budgetRowToObj));
    saveSettings();
    return true;
  } catch (e) { return false; }
}
async function pullBills() {
  if (!sb || !currentUser) return false;
  try {
    const { data, error } = await sb.from("bills").select("*").eq("user_id", currentUser.id);
    if (error) throw error;
    setBills(mergeRowsById(bills, data, rowToBill));
    saveSettings();
    return true;
  } catch (e) { return false; }
}
async function pullGoals() {
  if (!sb || !currentUser) return false;
  try {
    const { data, error } = await sb.from("goals").select("*").eq("user_id", currentUser.id);
    if (error) throw error;
    setGoals(mergeRowsById(goals, data, rowToGoal));
    saveSettings();
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
  // Pull first: a device/session that hasn't yet learned about a deletion
  // made elsewhere still holds the old (or hardcoded default) row locally.
  // Pushing that stale copy before pulling would re-upload it with a fresh
  // timestamp and silently resurrect it in the cloud (and everywhere else).
  const pullTxOk = await pullTransactions();
  const pullBudgetOk = await pullBudgets();
  const pullBillOk = await pullBills();
  const pullGoalOk = await pullGoals();
  const pushTxOk = await pushRows("transactions", transactions.map((t) => txToRow(t, false)));
  const pushBudgetOk = await pushRows("budgets", budgets.map((b) => budgetToRow(b, false)));
  const pushBillOk = await pushRows("bills", bills.map((b) => billToRow(b, false)));
  const pushGoalOk = await pushRows("goals", goals.map((g) => goalToRow(g, false)));
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
export function setCurrentUser(user) { currentUser = user; }
