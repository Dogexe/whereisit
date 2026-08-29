import { state } from "../state.js";
import { L } from "../i18n.js";
import { currentUser } from "../sync.js";
import { accountDisplayName } from "../account.js";

// Screens are registered at boot (see registerRenderers), not statically
// imported here -- each screen module needs setTab/renderScreen from this
// module, and a static import in both directions would be circular.
let renderers = null;
export function registerRenderers(r) { renderers = r; }

export function setTab(tab) {
  state.tab = tab;
  renderScreen();
  // Fade-in only on a genuine tab switch, not every renderScreen() call
  // (sync pulls, local saves, etc. call it too, and a fade on every one of
  // those would read as a glitch rather than polish). Force a reflow
  // between remove/re-add so the CSS animation actually restarts.
  const screenEl = document.getElementById("screen");
  if (screenEl) {
    screenEl.classList.remove("screen-enter");
    void screenEl.offsetWidth;
    screenEl.classList.add("screen-enter");
  }
}
export function renderScreen() {
  if (state.tab === "home") renderers.home();
  else if (state.tab === "transactions") renderers.transactions();
  else if (state.tab === "add") renderers.add();
  else if (state.tab === "insights") renderers.insights();
  else if (state.tab === "settings") renderers.settings();
  renderChrome();
}

export function renderChrome() {
  document.title = L().appTitle;
  document.documentElement.lang = state.lang;
  // .nav-btn covers both #tabbar's (mobile) and #sidebar's (desktop, see
  // styles.css's 1024px breakpoint) buttons -- whichever is actually
  // visible at the current viewport width gets its active state/labels
  // updated identically, since both are always present in the DOM.
  document.querySelectorAll("#sidebar [data-l]").forEach((el) => { el.textContent = L()[el.getAttribute("data-l")]; });
  document.querySelectorAll(".nav-btn span[data-l]").forEach((el) => { el.textContent = L()[el.getAttribute("data-l")]; });
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.toggle("active", btn.getAttribute("data-tab") === state.tab));
  // Sidebar footer account status -- mirrors Settings' own profile row
  // (same accountDisplayName() helper, see account.js) so the two never
  // disagree. renderChrome() already re-runs on every auth-state change,
  // language switch, and navigation, so this needs no listener of its own.
  const sidebarAccountName = document.getElementById("sidebarAccountName");
  if (sidebarAccountName) sidebarAccountName.textContent = accountDisplayName(currentUser, L().notSignedIn);
  // Home/Insights use the wider 880px+ layout for their own internal
  // grids; Transactions and Settings joined them once each gained its own
  // desktop-only layout (a dense table, and a list-left/detail-right
  // split, respectively -- both in styles.css's 1024px block) that
  // genuinely benefits from the extra room -- see styles.css's 880px
  // block for why Add deliberately stays capped at a narrower centered
  // width instead (a form/dialog reads worse full-bleed, not better).
  const screenEl = document.getElementById("screen");
  if (screenEl) screenEl.classList.toggle("screen-wide", state.tab === "home" || state.tab === "insights" || state.tab === "transactions" || state.tab === "settings");
}
