import { L } from "./i18n.js";
import { state, bills } from "./state.js";
import { refreshIcons, isDesktopShell } from "./utils.js";
import { loadFromStorage } from "./storage.js";
import { loadPending } from "./pending.js";
import { loadWatermark, resetWatermark } from "./watermark.js";
import { shouldWipeLocalData, getStoredUserId, setStoredUserId } from "./account.js";
import { applyTheme, applyThemeStyle } from "./theme.js";
import {
  sb, setCurrentUser, currentUser, hasLiveInputRisk, syncNow, setSyncStatus, setSyncRerenderCallback, markAllPending,
  wipeLocalAccountData, backfillCategoryIds, backfillAccountIds
} from "./sync.js";
import { setDeferredInstallPrompt } from "./pwa-install.js";
import { initErrorReporting } from "./error-report.js";
import { setTab, renderScreen, registerRenderers } from "./screens/router.js";
import { renderHome } from "./screens/home.js";
import { renderTransactions } from "./screens/transactions.js";
import { renderAdd, resetForm, openAddSheet } from "./screens/add.js";
import { renderInsights } from "./screens/insights.js";
import { renderSettings } from "./screens/settings.js";

registerRenderers({
  home: renderHome,
  transactions: renderTransactions,
  add: renderAdd,
  insights: renderInsights,
  settings: renderSettings
});

// Captured before anything (including the auth listener below) has a
// chance to strip the query string, so a bill reminder notification's
// tap -- sw.js's notificationclick navigates to "./?bill=<id>" -- still
// gets read even though the auth-state callback runs asynchronously and
// would otherwise race it away.
const billIdFromNotification = new URLSearchParams(window.location.search).get("bill");

initErrorReporting();
setSyncRerenderCallback(renderScreen);
loadFromStorage();
loadPending();
loadWatermark();
// One-time migration (docs/specs/custom-categories.md stage 2) -- stamps
// categoryId onto any transaction/budget/bill that doesn't have one yet.
// Run before the first render so even the very first paint reflects it,
// though nothing currently on screen reads categoryId yet.
backfillCategoryIds();
// One-time migration (docs/specs/multi-account-support.md stage 2) --
// stamps accountId onto any transaction that doesn't have one yet, creating
// a default account first if this device/account genuinely has none.
backfillAccountIds();
applyTheme();
applyThemeStyle();
renderScreen();
refreshIcons();

// Deep-links a tapped bill reminder straight to that bill's edit form in
// Settings when it's already synced locally; otherwise still lands on
// Settings with the Bills group expanded (a device that hasn't synced yet
// still gets *somewhere* useful, rather than nothing). Only ever reached
// via a real notification tap, never on a plain page load without that
// query param.
if (billIdFromNotification) {
  state.tab = "settings";
  state.settingsGroupOpen.bills = true;
  state.settingsActiveSection = "bills";
  if (bills.some((b) => b.id === billIdFromNotification)) state.billEditId = billIdFromNotification;
  renderScreen();
  window.history.replaceState(null, "", window.location.pathname);
}

// .nav-btn covers both #tabbar's (mobile) and #sidebar's (desktop) buttons
// -- wired identically since only one of the two is ever visible at a time,
// except for "add": docs/specs/add-transaction-bottom-sheet.md makes Add a
// bottom-sheet overlay below the desktop breakpoint instead of a real tab,
// so state.tab never changes and whichever tab was already active stays
// highlighted. Desktop keeps navigating to the full-page Add screen exactly
// as before.
document.querySelectorAll(".nav-btn").forEach((btn) => btn.addEventListener("click", () => {
  const tab = btn.getAttribute("data-tab");
  if (tab === "add") {
    resetForm();
    if (!isDesktopShell()) { openAddSheet(); return; }
  }
  setTab(tab);
}));

window.addEventListener("online", syncNow);
window.addEventListener("offline", () => setSyncStatus(L().syncOffline, false));
document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") syncNow(); });
setInterval(syncNow, 25000);

if (sb) {
  sb.auth.onAuthStateChange(function (event, session) {
    setCurrentUser(session ? session.user : null);
    if (window.location.hash || window.location.search) {
      window.history.replaceState(null, "", window.location.origin + window.location.pathname);
    }
    // Primary fix for cross-account data leaking on a shared device: on a
    // clean sign-out, wipe everything account-scoped (transactions,
    // budgets, bills, goals, pending queue, watermark) rather than leaving
    // it sitting in memory/localStorage for whoever signs in next -- see
    // wipeLocalAccountData()'s own doc comment in sync.js.
    if (event === "SIGNED_OUT") {
      wipeLocalAccountData();
      if (!hasLiveInputRisk()) renderScreen();
    }
    // The account-mismatch check runs for both "SIGNED_IN" (a genuine new
    // sign-in -- fresh OAuth completion, or a long-offline device
    // re-authenticating) and "INITIAL_SESSION" (an already-signed-in page
    // load restoring its existing session). It has to cover
    // INITIAL_SESSION too: a user who already had cloud data loaded before
    // this account-tracking code ever shipped will hit INITIAL_SESSION,
    // not SIGNED_IN, on their first load afterward -- without recording
    // their account id here, a later account switch on that device
    // wouldn't have anything to compare against and would silently miss
    // the wipe. "TOKEN_REFRESHED" is deliberately excluded from all of
    // this -- same account, nothing to check.
    //
    // shouldWipeLocalData() is the safety net for when SIGNED_OUT above
    // never fired cleanly (app closed mid-session, an expired token,
    // sign-in arriving via a different flow): if the account id stored
    // from whoever last used this device doesn't match who's signing in
    // now, whatever's currently local belongs to the *previous* account
    // and must be wiped before markAllPending() gets anywhere near it --
    // otherwise it would mark the old account's data pending and upload it
    // into the new one. No stored id at all (or the same id) is not a
    // wipe -- see account.js's own doc comment for why.
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      const incomingId = session ? session.user.id : null;
      if (incomingId) {
        if (shouldWipeLocalData(getStoredUserId(), incomingId)) {
          wipeLocalAccountData();
          if (!hasLiveInputRisk()) renderScreen();
        }
        setStoredUserId(incomingId);
      }
      // The "one full upload/download" side effects stay exclusive to a
      // genuine SIGNED_IN -- INITIAL_SESSION is continuity, not a fresh
      // sign-in, so it shouldn't trigger a full re-sync on every page load.
      if (event === "SIGNED_IN") {
        // resetWatermark() pairs with markAllPending() as the
        // download-side counterpart: even on a same-account resume (no
        // wipe above), a watermark left over from a stale/long-offline
        // local state shouldn't filter out changes made elsewhere in the
        // meantime.
        markAllPending();
        resetWatermark();
      }
    }
    if (state.tab === "settings" && !hasLiveInputRisk()) renderSettings();
    if (currentUser) syncNow();
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  // When a newly-deployed service worker takes over an already-open tab
  // (e.g. the tab that was sitting open before/during a Google sign-in
  // redirect), reload once so the page picks up the new app shell instead
  // of silently continuing to render whatever version it was loaded with.
  let swRefreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swRefreshing) return;
    swRefreshing = true;
    window.location.reload();
  });
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  setDeferredInstallPrompt(e);
  if (state.tab === "settings" && !hasLiveInputRisk()) renderSettings();
});
window.addEventListener("appinstalled", () => {
  setDeferredInstallPrompt(null);
  if (state.tab === "settings" && !hasLiveInputRisk()) renderSettings();
});
