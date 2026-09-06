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
import { $, icon, escapeHtml, createFocusTrap, isDesktopShell, PLUS_ICON, sheetGrabberHtml, wireSheetDrag } from "../utils.js";
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
      ${icon("bell")}
      <span class="label">${escapeHtml(l.billRemindersLabel)}</span>
      <button type="button" class="switch ${pushState === "enabled" ? "on" : ""}" id="pushReminderSwitch" ${disabled ? "disabled" : ""}><span class="thumb"></span></button>
    </div>
    ${hint ? `<div class="empty-note" style="padding:4px 4px 10px;text-align:left">${escapeHtml(hint)}</div>` : ""}`;
}

const SETTINGS_SUB_PAGE_IDS = new Set(["budgets", "bills", "goals", "categories", "accounts", "security"]);

export function openSettingsSubPage(section) {
  if (!SETTINGS_SUB_PAGE_IDS.has(section)) return;
  state.settingsSubPage = section;
  if (!isDesktopShell()) history.pushState({ settingsSubPage: section }, "");
}

export function closeSettingsSubPage() {
  if (isDesktopShell() || !SETTINGS_SUB_PAGE_IDS.has(state.settingsSubPage)) return false;
  history.back();
  return true;
}

window.addEventListener("popstate", () => {
  if (isDesktopShell() || !SETTINGS_SUB_PAGE_IDS.has(state.settingsSubPage)) return;
  state.settingsSubPage = null;
  renderScreen();
});

export function renderSettings() {
  const l = L();
  const meta = currentUser ? (currentUser.user_metadata || {}) : {};
  const avatarUrl = meta.avatar_url || meta.picture || "";
  const name = accountDisplayName(currentUser, l.notSignedIn);
  const desktop = isDesktopShell();
  const activeSection = state.settingsSubPage || "display";
  const mobileSubPage = !desktop && SETTINGS_SUB_PAGE_IDS.has(state.settingsSubPage) ? state.settingsSubPage : null;

  $("screen").innerHTML = `
    <div class="settings-screen">
    <div class="settings-block">

      ${desktop || !mobileSubPage ? `<div class="settings-profile-header">
        ${avatarUrl ? `<img class="avatar" src="${escapeHtml(avatarUrl)}" alt="">` : `<div class="avatar">${currentUser ? escapeHtml((name || "?").slice(0, 1).toUpperCase()) : icon("user")}</div>`}
        <div class="profile-name">${escapeHtml(name)}</div>
        ${currentUser ? "" : `<button type="button" class="btn btn-secondary btn-sm" id="authBtn">${escapeHtml(l.signInGoogle)}</button>`}
      </div>` : ""}

      <div class="settings-layout" data-active="${activeSection}" data-mobile-subpage="${mobileSubPage || "root"}">
        ${desktop ? `<nav class="settings-nav" aria-label="${escapeHtml(l.settingsTitle)}">
          <button type="button" class="settings-nav-item${activeSection === "display" ? " active" : ""}" data-settings-section="display">${icon("languages")}<span>${escapeHtml(l.displaySection)}</span></button>
          <button type="button" class="settings-nav-item${activeSection === "sync" ? " active" : ""}" data-settings-section="sync">${icon("cloud")}<span>${escapeHtml(l.syncSection)}</span></button>
          <button type="button" class="settings-nav-item${activeSection === "budgets" ? " active" : ""}" data-settings-section="budgets">${icon("wallet")}<span>${escapeHtml(l.budgetsSection)}</span></button>
          <button type="button" class="settings-nav-item${activeSection === "bills" ? " active" : ""}" data-settings-section="bills">${icon("receipt")}<span>${escapeHtml(l.billsSection)}</span></button>
          <button type="button" class="settings-nav-item${activeSection === "goals" ? " active" : ""}" data-settings-section="goals">${icon("target")}<span>${escapeHtml(l.goalsSection)}</span></button>
          <button type="button" class="settings-nav-item${activeSection === "categories" ? " active" : ""}" data-settings-section="categories">${icon("layout-grid")}<span>${escapeHtml(l.categoriesSection)}</span></button>
          <button type="button" class="settings-nav-item${activeSection === "accounts" ? " active" : ""}" data-settings-section="accounts">${icon("landmark")}<span>${escapeHtml(l.accountsSection)}</span></button>
          <button type="button" class="settings-nav-item${activeSection === "security" ? " active" : ""}" data-settings-section="security">${icon("shield")}<span>${escapeHtml(l.securitySection)}</span></button>
        </nav>` : ""}
        <div class="settings-panels">

      ${desktop || !mobileSubPage ? `<div data-settings-panel="display">
        <div class="settings-section-label">${escapeHtml(l.displaySection)}</div>
        <div class="list-card">
          <div class="toggle-row">
            ${icon("languages")}
            <span class="label">${escapeHtml(l.languageSection)}</span>
            <div class="tabs" role="radiogroup" style="flex-shrink:0">
              <label class="tab-opt"><input type="radio" name="lang-switch" value="th" ${state.lang === "th" ? "checked" : ""}>ไทย</label>
              <label class="tab-opt"><input type="radio" name="lang-switch" value="en" ${state.lang === "en" ? "checked" : ""}>English</label>
            </div>
          </div>
          <div class="toggle-row">
            ${icon("palette")}
            <span class="label">${escapeHtml(l.accentColorLabel)}</span>
            <div class="tabs" role="radiogroup" style="flex-shrink:0">
              <label class="tab-opt"><input type="radio" name="accent-color-switch" value="coral" ${state.accentColor === "coral" ? "checked" : ""}>${escapeHtml(l.accentColorCoralOpt)}</label>
              <label class="tab-opt"><input type="radio" name="accent-color-switch" value="purple" ${state.accentColor === "purple" ? "checked" : ""}>${escapeHtml(l.accentColorPurpleOpt)}</label>
            </div>
          </div>
          <div class="toggle-row">
            ${icon("moon")}
            <span class="label">${escapeHtml(l.darkModeBtn)}</span>
            <button type="button" class="switch ${state.dark ? "on" : ""}" id="darkSwitch"><span class="thumb"></span></button>
          </div>
          <div class="toggle-row">
            ${icon(state.hideAmounts ? "eye-off" : "eye")}
            <span class="label">${escapeHtml(l.hideAmountsLabel)}</span>
            <button type="button" class="switch ${state.hideAmounts ? "on" : ""}" id="hideAmountsSwitch"><span class="thumb"></span></button>
          </div>
        </div>
      </div>` : ""}

      ${desktop || !mobileSubPage ? `<div data-settings-panel="sync">
        <div class="settings-section-label">${escapeHtml(l.syncSection)}</div>
        <div class="list-card">
          <div class="toggle-row">
            ${icon("cloud")}
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
            ${icon("download")}
            <span class="label">${escapeHtml(l.exportBtn)}</span>
          </button>
          <button type="button" class="toggle-row" id="openImportSheetBtn">
            ${icon("upload")}
            <span class="label">${escapeHtml(l.importBtn)}</span>
          </button>
        </div>
        ${exportSheetHtml()}
        ${importSheetHtml()}
      </div>` : ""}

      ${desktop || mobileSubPage !== "security" ? `<div data-settings-panel="manage">
        ${desktop || mobileSubPage ? "" : `<div class="settings-mobile-manage-nav">
          <div class="settings-section-label">${escapeHtml(l.manageSection)}</div>
          <div class="list-card">
            <button type="button" class="toggle-row settings-drill-row" data-settings-subpage-link="budgets">${icon("wallet")}<span class="label">${escapeHtml(l.budgetsSection)}</span><span class="settings-item-count">${budgets.length}</span>${icon("chevron-right")}</button>
            <button type="button" class="toggle-row settings-drill-row" data-settings-subpage-link="bills">${icon("receipt")}<span class="label">${escapeHtml(l.billsSection)}</span><span class="settings-item-count">${bills.length}</span>${icon("chevron-right")}</button>
            <button type="button" class="toggle-row settings-drill-row" data-settings-subpage-link="goals">${icon("target")}<span class="label">${escapeHtml(l.goalsSection)}</span><span class="settings-item-count">${goals.length}</span>${icon("chevron-right")}</button>
            <button type="button" class="toggle-row settings-drill-row" data-settings-subpage-link="categories">${icon("layout-grid")}<span class="label">${escapeHtml(l.categoriesSection)}</span><span class="settings-item-count">${categories.length}</span>${icon("chevron-right")}</button>
            <button type="button" class="toggle-row settings-drill-row" data-settings-subpage-link="accounts">${icon("landmark")}<span class="label">${escapeHtml(l.accountsSection)}</span><span class="settings-item-count">${accounts.length}</span>${icon("chevron-right")}</button>
          </div>
        </div>`}
        <div class="settings-manage-panels">
          ${desktop || mobileSubPage === "budgets" ? `<section class="settings-manage-section" data-settings-section-content="budgets">
            <div class="settings-manage-header">
              ${desktop ? "" : `<button type="button" class="btn btn-icon settings-back-btn" aria-label="${escapeHtml(l.backAria)}">${icon("chevron-left")}</button>`}
              ${icon("wallet")}
              <span class="label">${escapeHtml(l.budgetsSection)}</span>
              <span class="settings-item-count">${budgets.length}</span>
              <button type="button" class="btn btn-icon" id="addBudgetBtn" aria-label="${escapeHtml(l.addBudgetBtn)}">${PLUS_ICON}</button>
            </div>
            <div class="settings-manage-body">
              <div id="budgetFormSlot">${isDesktopShell() ? budgetFormHtml() : ""}</div>
              ${budgets.map(budgetRowHtml).join("") || `<div class="empty-note">${escapeHtml(l.noBudgets)}</div>`}
            </div>
          </section>` : ""}
          ${desktop || mobileSubPage === "bills" ? `<section class="settings-manage-section" data-settings-section-content="bills">
            <div class="settings-manage-header">
              ${desktop ? "" : `<button type="button" class="btn btn-icon settings-back-btn" aria-label="${escapeHtml(l.backAria)}">${icon("chevron-left")}</button>`}
              ${icon("receipt")}
              <span class="label">${escapeHtml(l.billsSection)}</span>
              <span class="settings-item-count">${bills.length}</span>
              <button type="button" class="btn btn-icon" id="addBillBtn" aria-label="${escapeHtml(l.addBillBtn)}">${PLUS_ICON}</button>
            </div>
            <div class="settings-manage-body">
              <div id="billFormSlot">${isDesktopShell() ? billFormHtml() : ""}</div>
              ${bills.map(billRowHtml).join("") || `<div class="empty-note">${escapeHtml(l.noBills)}</div>`}
            </div>
          </section>` : ""}
          ${desktop || mobileSubPage === "goals" ? `<section class="settings-manage-section" data-settings-section-content="goals">
            <div class="settings-manage-header">
              ${desktop ? "" : `<button type="button" class="btn btn-icon settings-back-btn" aria-label="${escapeHtml(l.backAria)}">${icon("chevron-left")}</button>`}
              ${icon("target")}
              <span class="label">${escapeHtml(l.goalsSection)}</span>
              <span class="settings-item-count">${goals.length}</span>
              <button type="button" class="btn btn-icon" id="addGoalBtn" aria-label="${escapeHtml(l.addGoalBtn)}">${PLUS_ICON}</button>
            </div>
            <div class="settings-manage-body">
              <div id="goalFormSlot">${state.goalEditId && isDesktopShell() ? goalFormHtml() : ""}</div>
              <div class="insight-cards" style="padding-bottom:0">
                ${goals.map(goalCardHtml).join("") || `<div class="empty-note">${escapeHtml(l.noGoals)}</div>`}
              </div>
            </div>
          </section>` : ""}
          ${desktop || mobileSubPage === "categories" ? `<section class="settings-manage-section" data-settings-section-content="categories">
            <div class="settings-manage-header">
              ${desktop ? "" : `<button type="button" class="btn btn-icon settings-back-btn" aria-label="${escapeHtml(l.backAria)}">${icon("chevron-left")}</button>`}
              ${icon("layout-grid")}
              <span class="label">${escapeHtml(l.categoriesSection)}</span>
              <span class="settings-item-count">${categories.length}</span>
              <button type="button" class="btn btn-icon" id="addCategoryBtn" aria-label="${escapeHtml(l.addCategoryBtn)}">${PLUS_ICON}</button>
            </div>
            <div class="settings-manage-body">
              <div id="categoryFormSlot">${isDesktopShell() ? categoryFormHtml() : ""}</div>
              ${groupedCategories(categories).map(categoryRowHtml).join("") || `<div class="empty-note">${escapeHtml(l.noCategories)}</div>`}
            </div>
          </section>` : ""}
          ${desktop || mobileSubPage === "accounts" ? `<section class="settings-manage-section" data-settings-section-content="accounts">
            <div class="settings-manage-header">
              ${desktop ? "" : `<button type="button" class="btn btn-icon settings-back-btn" aria-label="${escapeHtml(l.backAria)}">${icon("chevron-left")}</button>`}
              ${icon("landmark")}
              <span class="label">${escapeHtml(l.accountsSection)}</span>
              <span class="settings-item-count">${accounts.length}</span>
              <button type="button" class="btn btn-icon" id="addAccountBtn" aria-label="${escapeHtml(l.addAccountBtn)}">${PLUS_ICON}</button>
            </div>
            <div class="settings-manage-body">
              <div id="accountFormSlot">${isDesktopShell() ? accountFormHtml() : ""}</div>
              ${accounts.map(accountRowHtml).join("") || `<div class="empty-note">${escapeHtml(l.noAccounts)}</div>`}
            </div>
          </section>` : ""}
        </div>
      </div>` : ""}

      ${desktop || mobileSubPage === "security" ? `<div data-settings-panel="security">
        ${desktop ? "" : `<div class="settings-security-subpage-header">
          <button type="button" class="btn btn-icon settings-back-btn" aria-label="${escapeHtml(l.backAria)}">${icon("chevron-left")}</button>
          <h2>${escapeHtml(l.securitySection)}</h2>
        </div>`}
        <div class="settings-section-label">${escapeHtml(l.securitySection)}</div>
        <div class="list-card">
          <div class="toggle-row">
            ${icon("shield")}
            <span class="label">${escapeHtml(l.requirePinLabel)}</span>
            <button type="button" class="switch ${state.pinEnabled ? "on" : ""}" id="pinRequireSwitch"><span class="thumb"></span></button>
          </div>
          <div style="padding:0 4px 10px;font-size:12px;color:var(--color-muted)">${escapeHtml(l.pinDescription)}</div>
          ${state.pinSetupActive ? pinSetupFormHtml() : ""}
        </div>
      </div>` : ""}

        </div>
      </div>

      ${!desktop && !mobileSubPage ? `<div class="list-card settings-utility-card">
        <button type="button" class="toggle-row settings-drill-row" data-settings-subpage-link="security">${icon("shield")}<span class="label">${escapeHtml(l.securitySection)}</span>${icon("chevron-right")}</button>
        <a class="toggle-row settings-external-row" href="./privacy.html" target="_blank" rel="noopener">${icon("shield")}<span class="label">${escapeHtml(l.privacyPolicyLink)}</span>${icon("arrow-up-right")}</a>
      </div>` : ""}
      ${desktop ? `<div class="list-card settings-utility-card settings-privacy-desktop">
        <a class="toggle-row settings-external-row" href="./privacy.html" target="_blank" rel="noopener">${icon("shield")}<span class="label">${escapeHtml(l.privacyPolicyLink)}</span>${icon("arrow-up-right")}</a>
      </div>` : ""}
      ${desktop || !mobileSubPage ? `${currentUser ? `<div class="list-card settings-logout-card"><button type="button" class="toggle-row settings-logout-row" id="authBtn">${icon("log-out")}<span class="label">${escapeHtml(l.signOutBtn)}</span></button></div>` : ""}
      <p class="footer-note">${escapeHtml(l.footerNote)}</p>` : ""}
    </div>
    </div>
  `;

  // Desktop-only list-left/detail-right nav. Pure DOM/class toggling keeps
  // switching sections from disturbing an open inline form.
  const settingsLayout = document.querySelector(".settings-layout");
  document.querySelectorAll(".settings-nav-item").forEach((btn) => btn.addEventListener("click", () => {
    const section = btn.getAttribute("data-settings-section");
    state.settingsSubPage = section === "display" ? null : section;
    settingsLayout.setAttribute("data-active", section);
    document.querySelectorAll(".settings-nav-item").forEach((b) => b.classList.toggle("active", b === btn));
  }));
  document.querySelectorAll("[data-settings-subpage-link]").forEach((btn) => btn.addEventListener("click", () => {
    openSettingsSubPage(btn.getAttribute("data-settings-subpage-link"));
    renderSettings();
  }));
  document.querySelectorAll(".settings-back-btn").forEach((btn) => btn.addEventListener("click", closeSettingsSubPage));

  if ($("authBtn")) $("authBtn").addEventListener("click", () => { currentUser ? signOutUser() : signInWithGoogle(); });
  document.querySelectorAll('input[name="lang-switch"]').forEach((r) => r.addEventListener("change", (e) => { state.lang = e.target.value; saveSettings(); renderChrome(); renderScreen(); }));
  document.querySelectorAll('input[name="accent-color-switch"]').forEach((r) => r.addEventListener("change", (e) => { state.accentColor = e.target.value; saveSettings(); applyTheme(); }));
  if ($("darkSwitch")) $("darkSwitch").addEventListener("click", () => { state.dark = !state.dark; saveSettings(); applyTheme(); renderScreen(); });
  if ($("hideAmountsSwitch")) $("hideAmountsSwitch").addEventListener("click", () => { state.hideAmounts = !state.hideAmounts; saveSettings(); renderScreen(); });
  // ui-ux-pro-max skill audit (Touch & Interaction, priority 2, "Loading
  // Buttons" -- Severity: High in the skill's own dataset): syncNow()
  // already updates the separate #syncStatus text/dot while it runs, but
  // this button itself never visually changed -- a real network
  // round-trip with zero feedback on the control the user actually
  // pressed. Disabling it here doesn't change syncNow()'s own behavior
  // (still exported/awaited exactly as before) or any of its other
  // fire-and-forget call sites elsewhere in this file.
  if ($("syncNowBtn")) $("syncNowBtn").addEventListener("click", async (e) => {
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
  if ($("openExportSheetBtn")) wireExportSheet();
  if ($("openImportSheetBtn")) wireImportSheet();

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
