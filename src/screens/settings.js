// The Settings screen. Split (see docs/CHANGELOG.md's "Settings module
// split" entry) out of what used to be one ~1140-line file absorbing
// display/sync/security toggles plus budgets/bills/goals/categories/
// accounts CRUD -- every new feature landed here and made it worse. Now
// this file owns only the screen shell itself: the big renderSettings()
// template, the mobile "Manage sheet" mechanism (has to know about every
// domain at once, so it can't move to just one of them), and the top-level
// wiring for the parts that were never really a CRUD domain of their own
// (profile row, nav-section switching, display/sync/security toggles,
// push reminders). Each Manage domain's row/form/save/delete lives in its
// own screens/settings-*.js module; the shared row/form scaffold they all
// use lives in screens/manage-row.js (also where the renderSettings
// callback those modules need gets registered, since they can't import it
// back from here directly -- see that file's own comment on why).
import { L } from "../i18n.js";
import { state, budgets, bills, goals, categories, accounts } from "../state.js";
import { $, icon, iconAvatar, escapeHtml, createFocusTrap, isDesktopShell, PLUS_ICON, sheetGrabberHtml, wireSheetDrag } from "../utils.js";
import { wireManageRowSwipe } from "./manage-row-swipe.js";
import { groupedCategories } from "../categories.js";
import { accountDisplayName } from "../account.js";
import { saveSettings } from "../storage.js";
import { applyTheme } from "../theme.js";
import { currentUser, lastSyncStatus, signInWithGoogle, signOutUser, syncNow } from "../sync.js";
import { renderChrome, renderScreen } from "./router.js";
import { deferredInstallPrompt, setDeferredInstallPrompt } from "../pwa-install.js";
import { pushReminderState, enableBillReminders, disableBillReminders } from "../push.js";
import { importSheetHtml, wireImportSheet } from "./import-sheet.js";
import { exportSheetHtml, wireExportSheet } from "./export-sheet.js";
import { wireInlineCrud, setSettingsRerender } from "./manage-row.js";
import { budgetRowHtml, budgetFormHtml, saveBudgetForm, deleteBudget } from "./settings-budgets.js";
import { billRowHtml, billFormHtml, saveBillForm, deleteBill } from "./settings-bills.js";
import { goalCardHtml, goalFormHtml, goalContributeFormHtml, saveGoalForm, deleteGoal, saveContribution } from "./settings-goals.js";
import { categoryRowHtml, categoryFormHtml, wireCategoryTypeRadios, saveCategoryForm, deleteCategory } from "./settings-categories.js";
import { accountRowHtml, accountFormHtml, saveAccountForm, deleteAccount, toggleArchiveAccount } from "./settings-accounts.js";
import { pinSetupFormHtml, saveNewPin, removePinWithUndo } from "./settings-security.js";

// docs/specs/settings-manage-swipe-and-sheet.md: below 1024px, every
// Manage section's add/edit(/contribute) form opens in this one shared
// sheet instead of expanding inline -- desktop is completely untouched
// (isDesktopShell() below), still rendering each xFormHtml() inline via
// the same wireInlineCrud pass as before this spec.
//
// Deliberately reactive rather than exposing separate openManageSheet()/
// closeManageSheet() functions the click handlers would need to call:
// wireInlineCrud's own add/edit/cancel handlers already set one of these
// six fields and call renderSettings() completely unchanged from their
// original desktop-only behavior. renderManageSheet(), called once at the
// very end of renderSettings() below, is the single place that decides
// whether that state change should now be showing as a sheet -- so
// wireInlineCrud never needed to learn about desktop vs. mobile at all.
//
// Each xFormHtml() is DOM-location-agnostic already (wires its own fields
// by plain id, not by assuming a parent container), so moving its
// rendered output into #manageSheetContainer needs no changes to any of
// them -- only to *where* the HTML string lands, and to never rendering
// the same form in both places at once (duplicate ids would break the
// id-based wiring both copies rely on).
function manageSheetFormDefs() {
  const l = L();
  return [
    { key: "budgetEditId", title: l.budgetsSection, formFn: budgetFormHtml, saveId: "saveBudgetFormBtn", saveFn: saveBudgetForm, cancelId: "cancelBudgetFormBtn" },
    { key: "billEditId", title: l.billsSection, formFn: billFormHtml, saveId: "saveBillFormBtn", saveFn: saveBillForm, cancelId: "cancelBillFormBtn" },
    { key: "goalEditId", title: l.goalsSection, formFn: goalFormHtml, saveId: "saveGoalFormBtn", saveFn: saveGoalForm, cancelId: "cancelGoalFormBtn" },
    { key: "goalContributeId", title: l.contributeAria, formFn: goalContributeFormHtml, saveId: "saveContributeBtn", saveFn: saveContribution, cancelId: "cancelContributeBtn" },
    { key: "categoryEditId", title: l.categoriesSection, formFn: categoryFormHtml, saveId: "saveCategoryFormBtn", saveFn: saveCategoryForm, cancelId: "cancelCategoryFormBtn" },
    { key: "accountEditId", title: l.accountsSection, formFn: accountFormHtml, saveId: "saveAccountFormBtn", saveFn: saveAccountForm, cancelId: "cancelAccountFormBtn" },
  ];
}
const manageSheetFocusTrap = createFocusTrap(() => {
  const backdrop = $("manageSheetBackdrop");
  return backdrop && !backdrop.hidden ? backdrop.querySelector(".filter-sheet") : null;
});
// wireInlineCrud's own cancel/close wiring (against #screen's content)
// can't reach a form rendered into #manageSheetContainer -- that
// container is populated by this function, called *after* the pass that
// wires #screen, so the sheet's copy of the same save/cancel button ids
// needs its own explicit wiring here every time it's (re)rendered.
function renderManageSheet() {
  const container = $("manageSheetContainer");
  if (!container) return;
  const active = manageSheetFormDefs().find((d) => state[d.key]);
  if (!active || isDesktopShell()) {
    if (state.manageSheetOpen) { state.manageSheetOpen = false; manageSheetFocusTrap.deactivate(); }
    container.innerHTML = "";
    return;
  }
  const l = L();
  const dismiss = () => { state[active.key] = null; renderSettings(); };
  container.innerHTML = `
    <div class="filter-sheet-backdrop" id="manageSheetBackdrop">
      <div class="filter-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(active.title)}">
        <div class="filter-sheet-header">
          ${sheetGrabberHtml()}
          <h3>${escapeHtml(active.title)}</h3>
          <button type="button" class="filter-sheet-close-btn" id="manageSheetClose" aria-label="${escapeHtml(l.closeAria)}">&times;</button>
        </div>
        <div class="sheet-body">
          ${active.formFn()}
        </div>
      </div>
    </div>`;
  $("manageSheetClose").addEventListener("click", dismiss);
  $("manageSheetBackdrop").addEventListener("click", (e) => { if (e.target === $("manageSheetBackdrop")) dismiss(); });
  // Re-wired on every call, not just once: this sheet's markup is fully
  // regenerated on every renderManageSheet() call (a fresh grabber element
  // each time), same reasoning as insights.js's Breakdown filter sheet.
  wireSheetDrag($("manageSheetContainer").querySelector(".sheet-grabber"), $("manageSheetContainer").querySelector(".filter-sheet"), dismiss);
  // The form's own Save button does exactly what it already does on
  // desktop (mutate state, toast, call renderSettings()) -- that
  // renderSettings() call reaches this same function again afterward and
  // finds the relevant key cleared, which is what actually closes the
  // sheet. No separate "close after save" step needed here.
  const saveBtn = $(active.saveId);
  if (saveBtn) saveBtn.addEventListener("click", active.saveFn);
  const cancelBtn = $(active.cancelId);
  if (cancelBtn) cancelBtn.addEventListener("click", dismiss);
  // Category/Account forms' icon picker (see renderSettings()'s own copy of
  // this exact wiring for the desktop-inline case) -- this sheet's copy of
  // the form didn't exist yet when that pass ran (renderManageSheet() runs
  // after it, populating #manageSheetContainer fresh each time), so without
  // this the picker rendered correctly but every icon button was inert.
  container.querySelectorAll(".icon-picker-option").forEach((btn) => btn.addEventListener("click", () => {
    btn.parentElement.querySelectorAll(".icon-picker-option").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
  }));
  wireCategoryTypeRadios(container);
  if (!state.manageSheetOpen) { state.manageSheetOpen = true; manageSheetFocusTrap.activate(); }
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !state.manageSheetOpen) return;
  const active = manageSheetFormDefs().find((d) => state[d.key]);
  if (active) { state[active.key] = null; renderSettings(); }
});

// The switch itself is disabled (not hidden) for "unsupported"/"denied" --
// seeing a reminders row exist but be unavailable, with a reason given
// right below it, is clearer than the row silently not being there.
// "off"/"enabled" are the only two states the switch actually toggles
// between; sign-in is checked at click time (enableBillReminders()
// itself) rather than blocking the switch here, since currentUser can
// change without a full Settings re-render in between.
function pushReminderRowHtml() {
  const l = L();
  const pushState = pushReminderState();
  const disabled = pushState === "unsupported" || pushState === "denied";
  const hint = pushState === "denied" ? l.pushDeniedHint : (pushState === "unsupported" ? l.pushUnsupportedHint : null);
  return `
    <div class="toggle-row">
      ${iconAvatar("bell", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
      <span class="label">${escapeHtml(l.billRemindersLabel)}</span>
      <button type="button" class="switch ${pushState === "enabled" ? "on" : ""}" id="pushReminderSwitch" ${disabled ? "disabled" : ""}><span class="thumb"></span></button>
    </div>
    ${hint ? `<div class="empty-note" style="padding:4px 4px 10px;text-align:left">${escapeHtml(hint)}</div>` : ""}`;
}

export function renderSettings() {
  const l = L();
  const meta = currentUser ? (currentUser.user_metadata || {}) : {};
  const avatarUrl = meta.avatar_url || meta.picture || "";
  const name = accountDisplayName(currentUser, l.notSignedIn);

  $("screen").innerHTML = `
    <h2 class="screen-title" style="margin-bottom:var(--space-xl)">${escapeHtml(l.settingsTitle)}</h2>
    <div class="settings-block">

      <div class="profile-row">
        ${avatarUrl ? `<img class="avatar" src="${escapeHtml(avatarUrl)}" alt="">` : `<div class="avatar">${currentUser ? escapeHtml((name || "?").slice(0, 1).toUpperCase()) : icon("user")}</div>`}
        <div>
          <div class="profile-name">${escapeHtml(name)}</div>
          <div class="profile-sub">${escapeHtml(currentUser ? l.personalAccount : "")}</div>
        </div>
        ${currentUser
          ? `<button type="button" class="btn btn-icon" id="authBtn" aria-label="${escapeHtml(l.signOutBtn)}">${icon("log-out")}</button>`
          : `<button type="button" class="btn btn-secondary btn-sm" id="authBtn">${escapeHtml(l.signInGoogle)}</button>`}
      </div>

      <div class="settings-layout" data-active="${state.settingsActiveSection}">
        <nav class="settings-nav" aria-label="${escapeHtml(l.settingsTitle)}">
          <button type="button" class="settings-nav-item${state.settingsActiveSection === "display" ? " active" : ""}" data-settings-section="display">${iconAvatar("languages", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}<span>${escapeHtml(l.displaySection)}</span></button>
          <button type="button" class="settings-nav-item${state.settingsActiveSection === "sync" ? " active" : ""}" data-settings-section="sync">${iconAvatar("cloud", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}<span>${escapeHtml(l.syncSection)}</span></button>
          <button type="button" class="settings-nav-item${state.settingsActiveSection === "budgets" ? " active" : ""}" data-settings-section="budgets">${iconAvatar("wallet", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}<span>${escapeHtml(l.budgetsSection)}</span></button>
          <button type="button" class="settings-nav-item${state.settingsActiveSection === "bills" ? " active" : ""}" data-settings-section="bills">${iconAvatar("receipt", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}<span>${escapeHtml(l.billsSection)}</span></button>
          <button type="button" class="settings-nav-item${state.settingsActiveSection === "goals" ? " active" : ""}" data-settings-section="goals">${iconAvatar("target", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}<span>${escapeHtml(l.goalsSection)}</span></button>
          <button type="button" class="settings-nav-item${state.settingsActiveSection === "categories" ? " active" : ""}" data-settings-section="categories">${iconAvatar("layout-grid", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}<span>${escapeHtml(l.categoriesSection)}</span></button>
          <button type="button" class="settings-nav-item${state.settingsActiveSection === "accounts" ? " active" : ""}" data-settings-section="accounts">${iconAvatar("landmark", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}<span>${escapeHtml(l.accountsSection)}</span></button>
          <button type="button" class="settings-nav-item${state.settingsActiveSection === "security" ? " active" : ""}" data-settings-section="security">${iconAvatar("shield", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}<span>${escapeHtml(l.securitySection)}</span></button>
        </nav>
        <div class="settings-panels">

      <div data-settings-panel="display">
        <div class="settings-section-label">${escapeHtml(l.displaySection)}</div>
        <div class="list-card">
          <div class="toggle-row">
            ${iconAvatar("languages", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
            <span class="label">${escapeHtml(l.languageSection)}</span>
            <div class="tabs" role="radiogroup" style="flex-shrink:0">
              <label class="tab-opt"><input type="radio" name="lang-switch" value="th" ${state.lang === "th" ? "checked" : ""}>ไทย</label>
              <label class="tab-opt"><input type="radio" name="lang-switch" value="en" ${state.lang === "en" ? "checked" : ""}>English</label>
            </div>
          </div>
          <div class="toggle-row">
            ${iconAvatar("palette", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
            <span class="label">${escapeHtml(l.accentColorLabel)}</span>
            <div class="tabs" role="radiogroup" style="flex-shrink:0">
              <label class="tab-opt"><input type="radio" name="accent-color-switch" value="coral" ${state.accentColor === "coral" ? "checked" : ""}>${escapeHtml(l.accentColorCoralOpt)}</label>
              <label class="tab-opt"><input type="radio" name="accent-color-switch" value="purple" ${state.accentColor === "purple" ? "checked" : ""}>${escapeHtml(l.accentColorPurpleOpt)}</label>
            </div>
          </div>
          <div class="toggle-row">
            ${iconAvatar("moon", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
            <span class="label">${escapeHtml(l.darkModeBtn)}</span>
            <button type="button" class="switch ${state.dark ? "on" : ""}" id="darkSwitch"><span class="thumb"></span></button>
          </div>
          <div class="toggle-row">
            ${iconAvatar(state.hideAmounts ? "eye-off" : "eye", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
            <span class="label">${escapeHtml(l.hideAmountsLabel)}</span>
            <button type="button" class="switch ${state.hideAmounts ? "on" : ""}" id="hideAmountsSwitch"><span class="thumb"></span></button>
          </div>
        </div>
      </div>

      <div data-settings-panel="sync">
        <div class="settings-section-label">${escapeHtml(l.syncSection)}</div>
        <div class="list-card">
          <div class="toggle-row">
            ${iconAvatar("cloud", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
            <span id="syncStatus" class="label ${lastSyncStatus.ok === true ? "ok" : (lastSyncStatus.ok === false ? "err" : "")}"><span class="sync-dot"></span><span>${escapeHtml(currentUser ? lastSyncStatus.text : l.syncSignedOut)}</span></span>
            <button type="button" class="btn btn-secondary btn-sm" id="syncNowBtn" ${currentUser ? "" : "disabled"}>${escapeHtml(l.syncNowBtn)}</button>
          </div>
          ${pushReminderRowHtml()}
          ${deferredInstallPrompt ? `
          <div style="padding:var(--space-sm) 4px">
            <button type="button" class="btn btn-primary btn-block" id="installAppBtn">
              ${icon("download-cloud")}
              ${escapeHtml(l.installAppBtn)}
            </button>
          </div>` : ""}
          <button type="button" class="toggle-row" id="openExportSheetBtn">
            ${iconAvatar("download", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
            <span class="label">${escapeHtml(l.exportBtn)}</span>
          </button>
          <button type="button" class="toggle-row" id="openImportSheetBtn">
            ${iconAvatar("upload", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
            <span class="label">${escapeHtml(l.importBtn)}</span>
          </button>
        </div>
        ${exportSheetHtml()}
        ${importSheetHtml()}
      </div>

      <div data-settings-panel="manage">
        <div class="settings-section-label">${escapeHtml(l.manageSection)}</div>
        <div class="list-card">
          <details class="settings-group" data-group="budgets" ${state.settingsGroupOpen.budgets ? "open" : ""}>
            <summary>
              ${iconAvatar("wallet", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
              <span class="label">${escapeHtml(l.budgetsSection)}</span>
              <span class="settings-badge-count">${budgets.length}</span>
              <button type="button" class="btn btn-icon" id="addBudgetBtn" aria-label="${escapeHtml(l.addBudgetBtn)}">${PLUS_ICON}</button>
              ${icon("chevron-right")}
            </summary>
            <div class="settings-group-body">
              <div id="budgetFormSlot">${isDesktopShell() ? budgetFormHtml() : ""}</div>
              ${budgets.map(budgetRowHtml).join("") || `<div class="empty-note">${escapeHtml(l.noBudgets)}</div>`}
            </div>
          </details>
          <details class="settings-group" data-group="bills" ${state.settingsGroupOpen.bills ? "open" : ""}>
            <summary>
              ${iconAvatar("receipt", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
              <span class="label">${escapeHtml(l.billsSection)}</span>
              <span class="settings-badge-count">${bills.length}</span>
              <button type="button" class="btn btn-icon" id="addBillBtn" aria-label="${escapeHtml(l.addBillBtn)}">${PLUS_ICON}</button>
              ${icon("chevron-right")}
            </summary>
            <div class="settings-group-body">
              <div id="billFormSlot">${isDesktopShell() ? billFormHtml() : ""}</div>
              ${bills.map(billRowHtml).join("") || `<div class="empty-note">${escapeHtml(l.noBills)}</div>`}
            </div>
          </details>
          <details class="settings-group" data-group="goals" ${state.settingsGroupOpen.goals ? "open" : ""}>
            <summary>
              ${iconAvatar("target", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
              <span class="label">${escapeHtml(l.goalsSection)}</span>
              <span class="settings-badge-count">${goals.length}</span>
              <button type="button" class="btn btn-icon" id="addGoalBtn" aria-label="${escapeHtml(l.addGoalBtn)}">${PLUS_ICON}</button>
              ${icon("chevron-right")}
            </summary>
            <div class="settings-group-body">
              <div id="goalFormSlot">${state.goalEditId && isDesktopShell() ? goalFormHtml() : ""}</div>
              <div class="insight-cards" style="padding-bottom:0">
                ${goals.map(goalCardHtml).join("") || `<div class="empty-note">${escapeHtml(l.noGoals)}</div>`}
              </div>
            </div>
          </details>
          <details class="settings-group" data-group="categories" ${state.settingsGroupOpen.categories ? "open" : ""}>
            <summary>
              ${iconAvatar("layout-grid", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
              <span class="label">${escapeHtml(l.categoriesSection)}</span>
              <span class="settings-badge-count">${categories.length}</span>
              <button type="button" class="btn btn-icon" id="addCategoryBtn" aria-label="${escapeHtml(l.addCategoryBtn)}">${PLUS_ICON}</button>
              ${icon("chevron-right")}
            </summary>
            <div class="settings-group-body">
              <div id="categoryFormSlot">${isDesktopShell() ? categoryFormHtml() : ""}</div>
              ${groupedCategories(categories).map(categoryRowHtml).join("") || `<div class="empty-note">${escapeHtml(l.noCategories)}</div>`}
            </div>
          </details>
          <details class="settings-group" data-group="accounts" ${state.settingsGroupOpen.accounts ? "open" : ""}>
            <summary>
              ${iconAvatar("landmark", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
              <span class="label">${escapeHtml(l.accountsSection)}</span>
              <span class="settings-badge-count">${accounts.length}</span>
              <button type="button" class="btn btn-icon" id="addAccountBtn" aria-label="${escapeHtml(l.addAccountBtn)}">${PLUS_ICON}</button>
              ${icon("chevron-right")}
            </summary>
            <div class="settings-group-body">
              <div id="accountFormSlot">${isDesktopShell() ? accountFormHtml() : ""}</div>
              ${accounts.map(accountRowHtml).join("") || `<div class="empty-note">${escapeHtml(l.noAccounts)}</div>`}
            </div>
          </details>
        </div>
      </div>

      <div data-settings-panel="security">
        <div class="settings-section-label">${escapeHtml(l.securitySection)}</div>
        <div class="list-card">
          <div class="toggle-row">
            ${iconAvatar("shield", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
            <span class="label">${escapeHtml(l.requirePinLabel)}</span>
            <button type="button" class="switch ${state.pinEnabled ? "on" : ""}" id="pinRequireSwitch"><span class="thumb"></span></button>
          </div>
          <div style="padding:0 4px 10px;font-size:12px;color:var(--color-muted)">${escapeHtml(l.pinDescription)}</div>
          ${state.pinSetupActive ? pinSetupFormHtml() : ""}
        </div>
      </div>

        </div>
      </div>

      <p class="footer-note">${escapeHtml(l.footerNote)}</p>
      <p class="footer-note"><a href="./privacy.html" target="_blank" rel="noopener">${escapeHtml(l.privacyPolicyLink)}</a></p>
    </div>
  `;

  // Desktop-only list-left/detail-right nav (styles.css's 1024px block) --
  // no effect below that breakpoint, where .settings-nav stays hidden and
  // every panel just stacks as before. Pure DOM/class toggling rather than
  // a full re-render, so switching sections never disturbs an open
  // inline form elsewhere on the page.
  const settingsLayout = document.querySelector(".settings-layout");
  document.querySelectorAll(".settings-nav-item").forEach((btn) => btn.addEventListener("click", () => {
    const section = btn.getAttribute("data-settings-section");
    state.settingsActiveSection = section;
    settingsLayout.setAttribute("data-active", section);
    document.querySelectorAll(".settings-nav-item").forEach((b) => b.classList.toggle("active", b === btn));
    // A closed <details> doesn't render its non-summary content at all --
    // not something a CSS display override can undo, it's part of how the
    // browser implements the element -- so the manage sub-sections need to
    // be genuinely open to show anything here. This only ever sets .open
    // to true (never false), and only via the live DOM property, so it
    // can't disturb state.settingsGroupOpen (the mobile accordion's own
    // persisted state) or the template's own `open` attribute output.
    const group = document.querySelector(`.settings-group[data-group="${section}"]`);
    if (group) group.open = true;
  }));
  $("authBtn").addEventListener("click", () => { currentUser ? signOutUser() : signInWithGoogle(); });
  document.querySelectorAll('input[name="lang-switch"]').forEach((r) => r.addEventListener("change", (e) => { state.lang = e.target.value; saveSettings(); renderChrome(); renderScreen(); }));
  document.querySelectorAll('input[name="accent-color-switch"]').forEach((r) => r.addEventListener("change", (e) => { state.accentColor = e.target.value; saveSettings(); applyTheme(); }));
  $("darkSwitch").addEventListener("click", () => { state.dark = !state.dark; saveSettings(); applyTheme(); renderScreen(); });
  $("hideAmountsSwitch").addEventListener("click", () => { state.hideAmounts = !state.hideAmounts; saveSettings(); renderScreen(); });
  // ui-ux-pro-max skill audit (Touch & Interaction, priority 2, "Loading
  // Buttons" -- Severity: High in the skill's own dataset): syncNow()
  // already updates the separate #syncStatus text/dot while it runs, but
  // this button itself never visually changed -- a real network
  // round-trip with zero feedback on the control the user actually
  // pressed. Disabling it here doesn't change syncNow()'s own behavior
  // (still exported/awaited exactly as before) or any of its other
  // fire-and-forget call sites elsewhere in this file.
  $("syncNowBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try { await syncNow(); } finally { btn.disabled = false; }
  });
  if ($("pushReminderSwitch")) $("pushReminderSwitch").addEventListener("click", async () => {
    if (pushReminderState() === "enabled") await disableBillReminders();
    else await enableBillReminders();
    renderSettings();
  });
  // docs/specs/app-lock.md stage 2: switching an already-off PIN on just
  // reveals the inline setup form (pinSetupFormHtml) -- pinEnabled only
  // actually flips once saveNewPin() succeeds. Switching an already-on PIN
  // off removes it immediately with an Undo toast, no re-entry, per the
  // spec's decision on why that's not worth the extra friction here.
  if ($("pinRequireSwitch")) $("pinRequireSwitch").addEventListener("click", () => {
    if (state.pinEnabled) { removePinWithUndo(); return; }
    state.pinSetupActive = !state.pinSetupActive;
    renderSettings();
  });
  if ($("savePinBtn")) $("savePinBtn").addEventListener("click", saveNewPin);
  if ($("cancelPinSetupBtn")) $("cancelPinSetupBtn").addEventListener("click", () => { state.pinSetupActive = false; renderSettings(); });
  if ($("installAppBtn")) $("installAppBtn").addEventListener("click", function () {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => {
      setDeferredInstallPrompt(null);
      renderSettings();
    });
  });
  document.querySelectorAll(".settings-group").forEach((d) => {
    d.addEventListener("toggle", () => { state.settingsGroupOpen[d.getAttribute("data-group")] = d.open; });
  });
  wireExportSheet();
  wireImportSheet();

  wireInlineCrud("Budget", "budgetEditId", deleteBudget, saveBudgetForm);
  wireInlineCrud("Bill", "billEditId", deleteBill, saveBillForm);
  wireInlineCrud("Goal", "goalEditId", deleteGoal, saveGoalForm, () => { state.goalContributeId = null; });
  document.querySelectorAll("[data-contribute-goal]").forEach((btn) => btn.addEventListener("click", () => { state.goalContributeId = btn.getAttribute("data-contribute-goal"); state.goalEditId = null; renderSettings(); }));
  if ($("saveContributeBtn")) $("saveContributeBtn").addEventListener("click", saveContribution);
  if ($("cancelContributeBtn")) $("cancelContributeBtn").addEventListener("click", () => { state.goalContributeId = null; renderSettings(); });
  wireInlineCrud("Category", "categoryEditId", deleteCategory, saveCategoryForm);
  // deleteAccount (an in-use-count guard, same shape as deleteCategory)
  // used to be a null deleteFn here -- accounts only had archive/unarchive
  // (toggleArchiveAccount below, wired separately since it isn't a
  // delete). A real bug from adding delete without updating this line: a
  // duplicate manual listener on [data-delete-account] alongside this
  // generic one fired deleteFn(null) first and threw, caught only by
  // checking the console during live verification, not by the click
  // "working" (the second, correct listener still fired despite the
  // first one's exception) -- removed the duplicate, this is the only
  // wiring for the account delete button now.
  wireInlineCrud("Account", "accountEditId", deleteAccount, saveAccountForm);
  document.querySelectorAll("[data-toggle-archive-account]").forEach((btn) => btn.addEventListener("click", () => toggleArchiveAccount(btn.getAttribute("data-toggle-archive-account"))));
  // Pure DOM toggling, not a re-render -- the picker's selection is only
  // ever read (via the .selected class) at save time in saveCategoryForm,
  // same as every other field in this form reading straight from the DOM.
  document.querySelectorAll(".icon-picker-option").forEach((btn) => btn.addEventListener("click", () => {
    btn.parentElement.querySelectorAll(".icon-picker-option").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
  }));
  wireCategoryTypeRadios(document);
  if (!isDesktopShell()) wireManageRowSwipe($("screen"));
  renderManageSheet();
}
// Registers this module's renderSettings as the callback every
// settings-*.js domain module calls after a mutation -- see manage-row.js's
// own comment on why they can't import it directly. A plain top-level call
// (not inside renderSettings itself) since it only ever needs to happen
// once, and renderSettings is a hoisted function declaration so this is
// safe regardless of import/evaluation order.
setSettingsRerender(renderSettings);
