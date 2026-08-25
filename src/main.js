import { L } from "./i18n.js";
import { state } from "./state.js";
import { refreshIcons } from "./utils.js";
import { loadFromStorage } from "./storage.js";
import { loadPending } from "./pending.js";
import { loadWatermark, resetWatermark } from "./watermark.js";
import { applyTheme } from "./theme.js";
import {
  sb, setCurrentUser, currentUser, hasLiveInputRisk, syncNow, setSyncStatus, setSyncRerenderCallback, markAllPending
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
    // "SIGNED_IN" only fires for a genuine new sign-in (fresh OAuth
    // completion, or a long-offline device re-authenticating) -- not for
    // "INITIAL_SESSION" (an already-signed-in page load restoring its
    // existing session) or "TOKEN_REFRESHED", so this runs once per actual
    // sign-in rather than once per reload/refresh. resetWatermark() pairs
    // with markAllPending() as the download-side counterpart: a different
    // account signing in on this device must not have its pull filtered by
    // a watermark left over from whoever was signed in before.
    if (event === "SIGNED_IN") { markAllPending(); resetWatermark(); }
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
