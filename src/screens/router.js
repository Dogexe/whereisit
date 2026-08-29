import { state } from "../state.js";
import { L } from "../i18n.js";

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
  document.querySelectorAll("#tabbar span[data-l]").forEach((el) => { el.textContent = L()[el.getAttribute("data-l")]; });
  document.querySelectorAll("#tabbar button").forEach((btn) => btn.classList.toggle("active", btn.getAttribute("data-tab") === state.tab));
}
