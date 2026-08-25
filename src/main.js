import { L } from "./i18n.js";
import { state } from "./state.js";
import { refreshIcons } from "./utils.js";
import { loadFromStorage } from "./storage.js";
import { loadPending } from "./pending.js";
import { loadWatermark, resetWatermark } from "./watermark.js";
import { shouldWipeLocalData, getStoredUserId, setStoredUserId } from "./account.js";
import { applyTheme } from "./theme.js";
import {
  sb, setCurrentUser, currentUser, hasLiveInputRisk, syncNow, setSyncStatus, setSyncRerenderCallback, markAllPending,
  wipeLocalAccountData
} from "./sync.js";
import { setDeferredInstallPrompt } from "./pwa-install.js";
import { initErrorReporting } from "./error-report.js";
import { setTab, renderScreen, registerRenderers } from "./screens/router.js";
import { renderHome } from "./screens/home.js";
import { renderTransactions } from "./screens/transactions.js";
import { renderAdd, resetForm } from "./screens/add.js";
import { renderInsights } from "./screens/insights.js";
import { renderSettings } from "./screens/settings.js";

registerRenderers({
  home: renderHome,
  transactions: renderTransactions,
  add: renderAdd,
  insights: renderInsights,
  settings: renderSettings
});

initErrorReporting();
setSyncRerenderCallback(renderScreen);
loadFromStorage();
loadPending();
loadWatermark();
applyTheme();
renderScreen();
refreshIcons();

document.querySelectorAll("#tabbar button").forEach((btn) => btn.addEventListener("click", () => {
  if (btn.getAttribute("data-tab") === "add") resetForm();
  setTab(btn.getAttribute("data-tab"));
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
    // "SIGNED_IN" only fires for a genuine new sign-in (fresh OAuth
    // completion, or a long-offline device re-authenticating) -- not for
    // "INITIAL_SESSION" (an already-signed-in page load restoring its
    // existing session) or "TOKEN_REFRESHED", so this runs once per actual
    // sign-in rather than once per reload/refresh.
    //
    // shouldWipeLocalData() is the safety net for when SIGNED_OUT above
    // never fired cleanly (app closed mid-session, an expired token,
    // sign-in arriving via a different flow): if the account id stored
    // from whoever last signed in here doesn't match who's signing in now,
    // whatever's currently local belongs to the *previous* account and
    // must be wiped before markAllPending() gets anywhere near it --
    // otherwise it would mark the old account's data pending and upload it
    // into the new one. No stored id at all (or the same id) is not a
    // wipe -- see account.js's own doc comment for why.
    if (event === "SIGNED_IN") {
      const incomingId = session ? session.user.id : null;
      if (shouldWipeLocalData(getStoredUserId(), incomingId)) {
        wipeLocalAccountData();
        if (!hasLiveInputRisk()) renderScreen();
      }
      setStoredUserId(incomingId);
      // resetWatermark() pairs with markAllPending() as the download-side
      // counterpart: even on a same-account resume (no wipe above), a
      // watermark left over from a stale/long-offline local state
      // shouldn't filter out changes made elsewhere in the meantime.
      markAllPending();
      resetWatermark();
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
