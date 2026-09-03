// Settings' Security section: the "Require PIN" toggle's own setup/removal
// form, split out of settings.js (see that file's own header comment for
// why). Distinct from applock.js (pure PIN hashing) and applock-ui.js (the
// lock-screen overlay itself) -- this is just the Settings-page UI for
// turning the feature on/off, per docs/specs/app-lock.md stage 2.
import { L } from "../i18n.js";
import { state } from "../state.js";
import { $, escapeHtml } from "../utils.js";
import { setPin, clearPin } from "../applock.js";
import { saveSettings } from "../storage.js";
import { showToast } from "../toast.js";
import { rerenderSettings } from "./manage-row.js";

// docs/specs/app-lock.md stage 2: revealed inline (same toggle-row area,
// not a separate dialog/sheet) the moment "Require PIN" is switched on --
// matching Categories' inline-form precedent. Only ever shown while
// state.pinSetupActive is true, i.e. before a PIN has actually been
// confirmed and saved; state.pinEnabled only flips true once saveNewPin()
// below succeeds.
export function pinSetupFormHtml() {
  const l = L();
  return `
    <div class="field" style="padding:0 4px">
      <label>${escapeHtml(l.pinLabel)}</label>
      <input class="input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="pinSetupInput" autocomplete="off">
    </div>
    <div class="field" style="padding:0 4px 10px">
      <label>${escapeHtml(l.confirmPinLabel)}</label>
      <input class="input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="pinConfirmInput" autocomplete="off">
    </div>
    <div style="display:flex;gap:8px;padding:0 4px 10px">
      <button type="button" class="btn btn-primary" id="savePinBtn">${escapeHtml(l.savePinBtn)}</button>
      <button type="button" class="btn btn-secondary" id="cancelPinSetupBtn">${escapeHtml(l.cancelBtn)}</button>
    </div>`;
}
const PIN_PATTERN = /^\d{4}$/;
export async function saveNewPin() {
  const pin = ($("pinSetupInput") || {}).value || "";
  const confirmPin = ($("pinConfirmInput") || {}).value || "";
  if (!PIN_PATTERN.test(pin)) { showToast(L().toastPinInvalid); return; }
  if (pin !== confirmPin) { showToast(L().toastPinMismatch); return; }
  await setPin(pin);
  state.pinSetupActive = false;
  showToast(L().toastPinSaved);
  rerenderSettings();
}
// Turning the toggle off (an already-enabled PIN) and Settings' own share
// of the lock screen's "Forgot PIN?" flow both go through this: act
// immediately, no confirm() dialog (this codebase has none, anywhere --
// see the spec's own note on checking that directly), then offer Undo via
// the same showToast(message, undoFn) shape deleteCategory/deleteBudget
// etc. already use. The snapshot is just the three plain fields -- no
// dedicated snapshot/restore helper in applock.js, per that module's own
// comment on why one isn't needed for something this small.
export function removePinWithUndo() {
  const snapshot = { pinEnabled: state.pinEnabled, pinHash: state.pinHash, pinSalt: state.pinSalt };
  clearPin();
  rerenderSettings();
  showToast(L().toastPinRemoved, () => {
    state.pinEnabled = snapshot.pinEnabled;
    state.pinHash = snapshot.pinHash;
    state.pinSalt = snapshot.pinSalt;
    saveSettings();
    rerenderSettings();
  });
}
