// docs/specs/app-lock.md stage 3: the lock screen overlay + boot/visibility
// gating. Split out from applock.js on purpose -- that module has to stay
// DOM-free to keep its own unit tests running in plain Node (see its doc
// comment), and this module is exactly the opposite: it only exists to
// touch the DOM. Not under screens/ -- unlike a tab, this isn't owned by
// any one screen and can cover any of them, the same reasoning
// #addSheetContainer/#manageSheetContainer's own doc comments in
// index.html already give for living outside #screen.
import { state } from "./state.js";
import { saveSettings } from "./storage.js";
import { verifyPin, clearPin } from "./applock.js";
import { $, escapeHtml, iconAvatar, createFocusTrap } from "./utils.js";
import { L } from "./i18n.js";
import { showToast } from "./toast.js";

// In-memory only, never persisted -- see the spec's own decision on why a
// stored "currently locked" flag isn't needed at all: a cold load always
// re-gates via renderAppLockGate() below (nothing to derive), and this
// flag only has to survive within one already-running page/tab session.
let locked = false;
// Set while a lock overlay is showing, to whatever extra work should run
// once it's actually dismissed -- the full rest of boot on a cold-load
// gate, or nothing (a plain no-op) on a mid-session re-lock, since the
// underlying screen was already rendered before backgrounding and never
// touched while covered.
let onUnlocked = null;

function appEl() { return document.querySelector(".app"); }

function doUnlock() {
  const container = $("appLockContainer");
  if (container) container.innerHTML = "";
  lockFocusTrap.deactivate();
  const app = appEl();
  if (app) app.classList.remove("app-blurred");
  locked = false;
  const cb = onUnlocked;
  onUnlocked = null;
  if (cb) cb();
}
function shakePanel() {
  const panel = document.querySelector(".app-lock-panel");
  if (!panel) return;
  // Re-adding the same class name is a no-op if the previous shake's
  // animation already finished (nothing to restart), but back-to-back
  // wrong attempts within one animation's own 400ms would otherwise never
  // visibly restart it either -- removing first, forcing a reflow, then
  // re-adding guarantees every wrong attempt gets its own shake.
  panel.classList.remove("app-lock-shake");
  void panel.offsetWidth;
  panel.classList.add("app-lock-shake");
}
function wireLockOverlay() {
  const l = L();
  const input = $("appLockPinInput");
  input.addEventListener("input", async () => {
    if (input.value.length < 4) return;
    const pin = input.value;
    input.value = "";
    const ok = await verifyPin(pin);
    if (ok) { doUnlock(); return; }
    shakePanel();
    showToast(l.toastWrongPin);
  });
  $("appLockForgotBtn").addEventListener("click", () => {
    // Same act-then-undo shape as Settings' toggle-off (removePinWithUndo
    // in screens/settings.js) -- see the spec's decision on why this
    // codebase's actual pattern for a destructive action is "do it, offer
    // Undo," not a confirm() dialog it doesn't use anywhere else.
    const snapshot = { pinEnabled: state.pinEnabled, pinHash: state.pinHash, pinSalt: state.pinSalt };
    clearPin();
    doUnlock();
    showToast(l.toastPinRemoved, () => {
      state.pinEnabled = snapshot.pinEnabled;
      state.pinHash = snapshot.pinHash;
      state.pinSalt = snapshot.pinSalt;
      saveSettings();
    });
  });
  input.focus();
}
function showLockOverlay(onUnlockSuccess) {
  onUnlocked = onUnlockSuccess;
  const l = L();
  const container = $("appLockContainer");
  container.innerHTML = `
    <div class="app-lock-backdrop" id="appLockBackdrop">
      <div class="app-lock-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(l.unlockAppTitle)}">
        ${iconAvatar("shield", "var(--color-accent-tint)", "var(--color-accent)", null, 'width="20" height="20"')}
        <h2>${escapeHtml(l.unlockAppTitle)}</h2>
        <input class="input app-lock-pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="appLockPinInput" autocomplete="off">
        <button type="button" class="app-lock-forgot-btn" id="appLockForgotBtn">${escapeHtml(l.forgotPinLink)}</button>
        <p class="app-lock-forgot-note">${escapeHtml(l.forgotPinNote)}</p>
      </div>
    </div>`;
  wireLockOverlay();
  lockFocusTrap.activate();
}
// No Escape-to-close listener, no wireSheetDrag() -- deliberately, unlike
// every other sheet in this app (see the spec's "Overlay pattern
// precedent" section). createFocusTrap()'s own piggybacked scroll-lock is
// still exactly right here though, same as any other full-screen overlay.
const lockFocusTrap = createFocusTrap(() => document.querySelector(".app-lock-panel"));

// Called once from main.js's boot, after loadFromStorage() has populated
// state.pinEnabled. onProceed is the rest of boot (renderScreen, the
// bill-notification deep link, refreshIcons) -- run immediately if no PIN
// is set, or deferred until a correct PIN/"Forgot PIN?" if one is.
export function renderAppLockGate(onProceed) {
  if (!state.pinEnabled) { onProceed(); return; }
  showLockOverlay(onProceed);
}
// Called once from main.js's boot to wire the immediate-threshold
// re-lock (decision 1 of the spec) and the app-switcher-blur cover
// (decision 2). A second, independent visibilitychange listener --
// main.js already has its own for sync-on-visible; multiple listeners on
// the same event don't conflict.
export function wireAppLockVisibility() {
  document.addEventListener("visibilitychange", () => {
    const app = appEl();
    if (document.visibilityState === "hidden") {
      // Applied unconditionally (not just when a PIN is enabled) -- cheap,
      // and means turning "Require PIN" on later never has to also
      // reconsider whether this listener already exists.
      if (app) app.classList.add("app-blurred");
      if (state.pinEnabled) locked = true;
      return;
    }
    // visible: if a re-lock is armed, showLockOverlay's own doUnlock()
    // removes the blur once the correct PIN/"Forgot PIN?" clears it --
    // until then the opaque overlay covers the still-blurred content
    // underneath anyway. Otherwise (no PIN enabled, or nothing was ever
    // armed) the blur has to be removed right here, explicitly -- it's
    // only ever added by this same handler, on hidden, unconditionally.
    if (locked) { showLockOverlay(() => {}); return; }
    if (app) app.classList.remove("app-blurred");
  });
}
