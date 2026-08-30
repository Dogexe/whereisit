import { L } from "../i18n.js";
import { state, transactions, budgets, bills, goals, categories, accounts, setBudgets, setBills, setGoals, setCategories, setAccounts } from "../state.js";
import {
  $, uid, icon, iconAvatar, escapeHtml, fmtMoney, optionsHtml, refreshIcons, createFocusTrap, isDesktopShell,
  EDIT_ICON, DELETE_ICON, PLUS_ICON
} from "../utils.js";
import { manageSwipeWrapHtml, wireManageRowSwipe } from "./manage-row-swipe.js";
import { CATEGORY_ICON_CHOICES, GOAL_TONES, GOAL_ICONS, iconFor, rowTone, categoryDisplayName } from "../categories.js";
import { ACCOUNT_ICON_CHOICES, accountNameById } from "../accounts.js";
import { accountDisplayName } from "../account.js";
import { daysUntilBillDue, dueSoonLabel, resolveCategoryId, computeBalance } from "../derived.js";
import { saveSettings } from "../storage.js";
import { applyTheme } from "../theme.js";
import {
  currentUser, lastSyncStatus, signInWithGoogle, signOutUser, syncNow,
  budgetToRow, billToRow, goalToRow, categoryToRow, accountToRow, pushRows
} from "../sync.js";
import { showToast } from "../toast.js";
import { renderChrome, renderScreen } from "./router.js";
import { deferredInstallPrompt, setDeferredInstallPrompt } from "../pwa-install.js";
import { exportToGoogleSheets } from "../sheets-export.js";
import { pushReminderState, enableBillReminders, disableBillReminders } from "../push.js";
import { importSheetHtml, wireImportSheet } from "./import-sheet.js";

// Both are simple named lists edited inline in Settings; share one row/CRUD shape.
// `iconHtml` is a pre-built iconAvatar() string -- category icon for
// budgets/bills, matching the same icon-led row shape as every other
// row in this redesigned Settings screen (toggle rows, group headers,
// transaction rows) instead of being the one bare-text exception.
// `actionsOverrideHtml`, when given, replaces the default edit+delete
// button pair entirely -- accounts (stage 3 of
// docs/specs/multi-account-support.md) have no delete action at all, only
// edit+archive/unarchive, so they pass their own actions markup instead of
// `editAttr`/`deleteAttr`. Every other caller (budgets/bills/categories)
// leaves this undefined and gets the original edit+delete pair unchanged.
// docs/specs/settings-manage-swipe-and-sheet.md: below 1024px, actions
// hide behind a swipe (manage-row-swipe.js) instead of always showing --
// desktop is completely untouched. `actionCount` only matters for the
// mobile branch (it sizes the reveal width) and defaults to 2 (the
// edit+delete pair every caller except accountRowHtml uses); accounts'
// 3-button actionsOverrideHtml passes 3 explicitly. The swipe wrapper
// doesn't need a real per-row id (manage-row-swipe.js's drag physics never
// reads data-id, only data-reveal), so "" is passed rather than trying to
// extract one out of editAttr/deleteAttr's raw HTML-attribute strings.
export function manageRowHtml(iconHtml, name, sub, amt, editAttr, deleteAttr, extraClass, actionsOverrideHtml, actionCount) {
  const content = `
    ${iconHtml}
    <div class="info"><div class="name">${escapeHtml(name)}</div><div class="sub">${escapeHtml(sub)}</div></div>
    ${amt ? `<div class="amt">${amt}</div>` : ""}`;
  const actions = actionsOverrideHtml || `
    <button type="button" class="btn btn-icon" ${editAttr} aria-label="${escapeHtml(L().editAria)}">${EDIT_ICON}</button>
    <button type="button" class="btn btn-icon" style="color:var(--color-expense-700)" ${deleteAttr} aria-label="${escapeHtml(L().deleteAria)}">${DELETE_ICON}</button>`;
  if (!isDesktopShell()) {
    return manageSwipeWrapHtml("", content, actions, actionCount || 2, `manage-row-content manage-row${extraClass ? " " + extraClass : ""}`);
  }
  return `
    <div class="manage-row${extraClass ? " " + extraClass : ""}">
      ${content}
      <div class="row-actions">${actions}</div>
    </div>`;
}
// Budgets and bills are always expense-side, so rowTone("expense")
// resolves to the same accent purple already used for every other icon
// in this Settings card -- only the glyph varies, exactly like
// transaction rows vary their glyph by category on a fixed tone. Resolves
// the icon through the live category record first (so an icon edit made
// in the new Categories section, stage 3, shows up immediately here too),
// falling back to the old string-keyed CATEGORY_ICON map via iconFor()
// for any row that predates categoryId entirely.
function categoryIconAvatar(categoryId, fallbackCategoryName) {
  const tone = rowTone("expense");
  const cat = categories.find((c) => c.id === categoryId);
  const iconName = cat ? cat.icon : iconFor(fallbackCategoryName);
  return iconAvatar(iconName, tone.bg, tone.color, "sm", 'width="15" height="15"');
}
// Wraps a set of field inputs with the standard Save/Cancel action row used
// by every inline add/edit form (budgets, bills, goals, goal contributions).
export function inlineForm(fieldsHtml, saveId, saveLabel, cancelId, extraStyle) {
  return `<div class="inline-form"${extraStyle ? ` style="${extraStyle}"` : ""}>${fieldsHtml}<div class="actions-row"><button type="button" class="btn btn-primary" id="${saveId}">${escapeHtml(saveLabel)}</button><button type="button" class="btn btn-secondary" id="${cancelId}">${escapeHtml(L().cancelBtn)}</button></div></div>`;
}
// Wires the add/edit/delete/save/cancel buttons shared by the Budgets,
// Bills, and Goals sections in Settings. `prefix` (capitalized) matches the
// element ids (e.g. "Budget" -> addBudgetBtn/saveBudgetFormBtn/data-edit-budget).
export function wireInlineCrud(prefix, stateKey, deleteFn, saveFn, onOpen) {
  const tag = prefix.toLowerCase();
  const addBtn = $("add" + prefix + "Btn");
  if (addBtn) addBtn.addEventListener("click", () => { state[stateKey] = "new"; if (onOpen) onOpen(); renderSettings(); });
  document.querySelectorAll(`[data-edit-${tag}]`).forEach((btn) => btn.addEventListener("click", () => {
    state[stateKey] = btn.getAttribute(`data-edit-${tag}`); if (onOpen) onOpen(); renderSettings();
  }));
  document.querySelectorAll(`[data-delete-${tag}]`).forEach((btn) => btn.addEventListener("click", () => deleteFn(btn.getAttribute(`data-delete-${tag}`))));
  const saveBtn = $("save" + prefix + "FormBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveFn);
  const cancelBtn = $("cancel" + prefix + "FormBtn");
  if (cancelBtn) cancelBtn.addEventListener("click", () => { state[stateKey] = null; renderSettings(); });
}

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
      <div class="filter-sheet" role="dialog" aria-label="${escapeHtml(active.title)}">
        <div class="filter-sheet-header">
          <h3>${escapeHtml(active.title)}</h3>
          <button type="button" class="filter-sheet-close-btn" id="manageSheetClose" aria-label="${escapeHtml(l.closeAria)}">&times;</button>
        </div>
        ${active.formFn()}
      </div>
    </div>`;
  $("manageSheetClose").addEventListener("click", dismiss);
  $("manageSheetBackdrop").addEventListener("click", (e) => { if (e.target === $("manageSheetBackdrop")) dismiss(); });
  // The form's own Save button does exactly what it already does on
  // desktop (mutate state, toast, call renderSettings()) -- that
  // renderSettings() call reaches this same function again afterward and
  // finds the relevant key cleared, which is what actually closes the
  // sheet. No separate "close after save" step needed here.
  const saveBtn = $(active.saveId);
  if (saveBtn) saveBtn.addEventListener("click", active.saveFn);
  const cancelBtn = $(active.cancelId);
  if (cancelBtn) cancelBtn.addEventListener("click", dismiss);
  refreshIcons();
  if (!state.manageSheetOpen) { state.manageSheetOpen = true; manageSheetFocusTrap.activate(); }
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !state.manageSheetOpen) return;
  const active = manageSheetFormDefs().find((d) => state[d.key]);
  if (active) { state[active.key] = null; renderSettings(); }
});

export function budgetRowHtml(b) {
  const bid = resolveCategoryId(b, "expense");
  const name = categoryDisplayName(categories, bid, b.category);
  return manageRowHtml(categoryIconAvatar(bid, b.category), name, L().budgetOf + " " + fmtMoney(b.limit), null, `data-edit-budget="${b.id}"`, `data-delete-budget="${b.id}"`);
}
export function budgetFormHtml() {
  const l = L();
  if (!state.budgetEditId) return "";
  const isNew = state.budgetEditId === "new";
  const editing = !isNew ? budgets.find((b) => b.id === state.budgetEditId) : null;
  if (!isNew && !editing) return "";
  const expenseCats = categories.filter((c) => c.type === "expense");
  const usedCatIds = new Set(budgets.filter((b) => b.id !== state.budgetEditId).map((b) => resolveCategoryId(b, "expense")));
  const availableCats = expenseCats.filter((c) => !usedCatIds.has(c.id));
  if (isNew && !availableCats.length) {
    return `<div class="inline-form"><div class="empty-note" style="padding:8px 0">${escapeHtml(l.allBudgeted)}</div><button type="button" class="btn btn-secondary" id="cancelBudgetFormBtn">${escapeHtml(l.cancelBtn)}</button></div>`;
  }
  const editingName = !isNew ? categoryDisplayName(categories, resolveCategoryId(editing, "expense"), editing.category) : "";
  const fields = (isNew
    ? `<div class="field"><label>${escapeHtml(l.categoryLabel)}</label><select class="input" id="budgetCategorySelect">${optionsHtml(availableCats.map((c) => c.id), null, (id) => categoryDisplayName(categories, id, id))}</select></div>`
    : `<div style="font-size:14px;font-weight:600">${escapeHtml(editingName)}</div>`)
    + `<div class="field"><label>${escapeHtml(l.limitLabel)}</label><input class="input" type="number" id="budgetLimitInput" min="0" step="1" value="${isNew ? "" : editing.limit}"></div>`;
  return inlineForm(fields, "saveBudgetFormBtn", l.saveBudgetBtn, "cancelBudgetFormBtn");
}
export function saveBudgetForm() {
  const isNew = state.budgetEditId === "new";
  const limitInput = $("budgetLimitInput");
  const limit = limitInput ? parseFloat(limitInput.value) : NaN;
  if (!limit || limit <= 0) { showToast(L().toastInvalidAmount); return; }
  let saved;
  if (isNew) {
    const sel = $("budgetCategorySelect");
    const categoryId = sel ? sel.value : "";
    if (!categoryId) return;
    const cat = categories.find((c) => c.id === categoryId);
    saved = { id: uid(), category: cat ? cat.name : "", categoryId, limit, updatedAt: Date.now() };
    budgets.push(saved);
  } else {
    const b = budgets.find((x) => x.id === state.budgetEditId);
    if (!b) return;
    b.limit = limit; b.updatedAt = Date.now();
    saved = b;
  }
  saveSettings();
  state.budgetEditId = null;
  showToast(L().toastBudgetSaved);
  renderSettings();
  pushRows("budgets", [budgetToRow(saved, false)]).then(() => syncNow());
}
export function deleteBudget(id) {
  const b = budgets.find((x) => x.id === id);
  if (!b) return;
  setBudgets(budgets.filter((x) => x.id !== id));
  saveSettings();
  if (state.budgetEditId === id) state.budgetEditId = null;
  renderSettings();
  b.updatedAt = Date.now();
  pushRows("budgets", [budgetToRow(b, true)]).then(() => syncNow());
  showToast(L().toastBudgetDeleted, () => {
    const restored = Object.assign({}, b, { updatedAt: Date.now() });
    budgets.push(restored);
    saveSettings();
    renderSettings();
    pushRows("budgets", [budgetToRow(restored, false)]).then(() => syncNow());
  });
}

export function billRowHtml(b) {
  const daysUntil = daysUntilBillDue(b);
  const overdue = daysUntil < 0;
  const sub = overdue ? dueSoonLabel(daysUntil) : L().dueOn + b.day;
  return manageRowHtml(categoryIconAvatar(resolveCategoryId(b, "expense"), b.category), b.name, sub, fmtMoney(b.amount), `data-edit-bill="${b.id}"`, `data-delete-bill="${b.id}"`, overdue ? "manage-row-overdue" : null);
}
export function billFormHtml() {
  const l = L();
  if (!state.billEditId) return "";
  const isNew = state.billEditId === "new";
  const editing = !isNew ? bills.find((b) => b.id === state.billEditId) : null;
  if (!isNew && !editing) return "";
  const expenseCats = categories.filter((c) => c.type === "expense");
  const curCategoryId = isNew ? (expenseCats[0] || {}).id : resolveCategoryId(editing, "expense");
  const fields = `
    <div class="field"><label>${escapeHtml(l.billNameLabel)}</label><input class="input" type="text" id="billNameInput" value="${isNew ? "" : escapeHtml(editing.name)}"></div>
    <div class="field"><label>${escapeHtml(l.categoryLabel)}</label><select class="input" id="billCategorySelect">${optionsHtml(expenseCats.map((c) => c.id), curCategoryId, (id) => categoryDisplayName(categories, id, id))}</select></div>
    <div class="field"><label>${escapeHtml(l.amountLabel)}</label><input class="input" type="number" id="billAmountInput" min="0" step="0.01" value="${isNew ? "" : editing.amount}"></div>
    <div class="field"><label>${escapeHtml(l.billDayLabel)}</label><input class="input" type="number" id="billDayInput" min="1" max="31" step="1" value="${isNew ? "" : editing.day}"></div>
  `;
  return inlineForm(fields, "saveBillFormBtn", l.saveBillBtn, "cancelBillFormBtn");
}
export function saveBillForm() {
  const isNew = state.billEditId === "new";
  const name = ($("billNameInput") || {}).value ? $("billNameInput").value.trim() : "";
  const categoryId = ($("billCategorySelect") || {}).value || (categories.find((c) => c.type === "expense") || {}).id;
  const cat = categories.find((c) => c.id === categoryId);
  const category = cat ? cat.name : "";
  const amount = parseFloat(($("billAmountInput") || {}).value);
  const day = parseInt(($("billDayInput") || {}).value, 10);
  if (!name || !amount || amount <= 0 || !day || day < 1 || day > 31) { showToast(L().toastInvalidAmount); return; }
  let saved;
  if (isNew) {
    saved = { id: uid(), name, category, categoryId, amount, day, updatedAt: Date.now() };
    bills.push(saved);
  } else {
    const b = bills.find((x) => x.id === state.billEditId);
    if (!b) return;
    b.name = name; b.category = category; b.categoryId = categoryId; b.amount = amount; b.day = day; b.updatedAt = Date.now();
    saved = b;
  }
  saveSettings();
  state.billEditId = null;
  showToast(L().toastBillSaved);
  renderSettings();
  pushRows("bills", [billToRow(saved, false)]).then(() => syncNow());
}
export function deleteBill(id) {
  const b = bills.find((x) => x.id === id);
  if (!b) return;
  setBills(bills.filter((x) => x.id !== id));
  saveSettings();
  if (state.billEditId === id) state.billEditId = null;
  renderSettings();
  b.updatedAt = Date.now();
  pushRows("bills", [billToRow(b, true)]).then(() => syncNow());
  showToast(L().toastBillDeleted, () => {
    const restored = Object.assign({}, b, { updatedAt: Date.now() });
    bills.push(restored);
    saveSettings();
    renderSettings();
    pushRows("bills", [billToRow(restored, false)]).then(() => syncNow());
  });
}

// Stage 3 of docs/specs/custom-categories.md: full add/edit/delete over
// categories, including today's built-ins -- not just custom additions on
// top of a protected list, per that spec's confirmed requirement.
export function categoryRowHtml(c) {
  const tone = rowTone(c.type);
  const iconHtml = iconAvatar(c.icon, tone.bg, tone.color, "sm", 'width="15" height="15"');
  const sub = c.type === "income" ? L().incomeLabel : L().expenseLabel;
  return manageRowHtml(iconHtml, c.name, sub, null, `data-edit-category="${c.id}"`, `data-delete-category="${c.id}"`);
}
// Type is only choosable when creating a new category, never when editing
// an existing one -- changing a category's type out from under
// transactions/budgets/bills that already reference it (budgets/bills are
// always expense-side, so an expense category flipping to income would
// orphan any of those referencing it) is a data-integrity question this
// spec deliberately doesn't take on; renaming and re-iconing don't have
// that problem, so those stay editable.
//
// The icon picker and (when creating) the type radio are read directly
// from the DOM at save time (see saveCategoryForm) rather than mirrored
// into `state`, matching how every other field in this form already
// works -- simpler than adding transient state fields for a value that's
// only ever needed once, at save.
export function categoryFormHtml() {
  const l = L();
  if (!state.categoryEditId) return "";
  const isNew = state.categoryEditId === "new";
  const editing = !isNew ? categories.find((c) => c.id === state.categoryEditId) : null;
  if (!isNew && !editing) return "";
  const curType = isNew ? "expense" : editing.type;
  const curIcon = isNew ? CATEGORY_ICON_CHOICES[0] : editing.icon;
  const typeField = isNew
    ? `<div class="field"><label>${escapeHtml(l.typeLabel)}</label><div class="tabs block" role="radiogroup"><label class="tab-opt"><input type="radio" name="category-type" value="expense" checked>${escapeHtml(l.expenseLabel)}</label><label class="tab-opt"><input type="radio" name="category-type" value="income">${escapeHtml(l.incomeLabel)}</label></div></div>`
    : `<div class="field"><label>${escapeHtml(l.typeLabel)}</label><div style="font-size:14px;font-weight:600">${escapeHtml(curType === "income" ? l.incomeLabel : l.expenseLabel)}</div></div>`;
  const iconPicker = `<div class="field"><label>${escapeHtml(l.iconLabel)}</label><div class="icon-picker">${CATEGORY_ICON_CHOICES.map((name) => `<button type="button" class="icon-picker-option${name === curIcon ? " selected" : ""}" data-icon="${name}" aria-label="${escapeHtml(name)}">${icon(name)}</button>`).join("")}</div></div>`;
  const fields = typeField
    + `<div class="field"><label>${escapeHtml(l.categoryNameLabel)}</label><input class="input" type="text" id="categoryNameInput" value="${isNew ? "" : escapeHtml(editing.name)}"></div>`
    + iconPicker;
  return inlineForm(fields, "saveCategoryFormBtn", l.saveCategoryBtn, "cancelCategoryFormBtn");
}
export function saveCategoryForm() {
  const isNew = state.categoryEditId === "new";
  const name = ($("categoryNameInput") || {}).value ? $("categoryNameInput").value.trim() : "";
  if (!name) { showToast(L().toastInvalidCategoryName); return; }
  const selectedIconBtn = document.querySelector(".icon-picker-option.selected");
  const iconName = selectedIconBtn ? selectedIconBtn.getAttribute("data-icon") : CATEGORY_ICON_CHOICES[0];
  let saved;
  if (isNew) {
    const typeInput = document.querySelector('input[name="category-type"]:checked');
    const type = typeInput ? typeInput.value : "expense";
    saved = { id: uid(), type, name, icon: iconName, sortOrder: categories.length, updatedAt: Date.now() };
    categories.push(saved);
  } else {
    const c = categories.find((x) => x.id === state.categoryEditId);
    if (!c) return;
    c.name = name; c.icon = iconName; c.updatedAt = Date.now();
    saved = c;
  }
  saveSettings();
  state.categoryEditId = null;
  showToast(L().toastCategorySaved);
  renderSettings();
  pushRows("categories", [categoryToRow(saved, false)]).then(() => syncNow());
}
// The app's first delete flow that has to check other tables before
// allowing the delete at all -- deleteBudget/deleteBill/deleteGoal above
// have no such guard, since nothing else references a budget/bill/goal by
// id the way transactions/budgets/bills reference a category. Uses the
// same resolveCategoryId matching every read path already goes through
// (derived.js), not a stricter "only rows with categoryId already set"
// check, so a category that's only ever been referenced by its name
// (pre-backfill, or a row created before stage 4 moves the Add screen to
// writing categoryId directly) is still correctly counted as in use.
function categoryUsageCount(categoryId) {
  const txCount = transactions.filter((t) => resolveCategoryId(t, t.type) === categoryId).length;
  const budgetCount = budgets.filter((b) => resolveCategoryId(b, "expense") === categoryId).length;
  const billCount = bills.filter((b) => resolveCategoryId(b, "expense") === categoryId).length;
  return txCount + budgetCount + billCount;
}
export function deleteCategory(id) {
  const c = categories.find((x) => x.id === id);
  if (!c) return;
  const usage = categoryUsageCount(id);
  if (usage > 0) { showToast(L().toastCategoryInUse.replace("{n}", usage)); return; }
  setCategories(categories.filter((x) => x.id !== id));
  saveSettings();
  if (state.categoryEditId === id) state.categoryEditId = null;
  renderSettings();
  c.updatedAt = Date.now();
  pushRows("categories", [categoryToRow(c, true)]).then(() => syncNow());
  showToast(L().toastCategoryDeleted, () => {
    const restored = Object.assign({}, c, { updatedAt: Date.now() });
    categories.push(restored);
    saveSettings();
    renderSettings();
    pushRows("categories", [categoryToRow(restored, false)]).then(() => syncNow());
  });
}

// Stage 3 of docs/specs/multi-account-support.md: full add/edit/archive
// over accounts -- deliberately no delete action (the original request's
// "archived flag rather than hard delete"), so the row's actions differ
// from every other manage-row in this file (edit + archive/unarchive, not
// edit + delete) via manageRowHtml's actionsOverrideHtml parameter.
export function accountRowHtml(a) {
  const tone = rowTone("expense");
  const iconHtml = iconAvatar(a.icon, tone.bg, tone.color, "sm", 'width="15" height="15"');
  const l = L();
  const actions = `
    <button type="button" class="btn btn-icon" data-edit-account="${a.id}" aria-label="${escapeHtml(l.editAria)}">${EDIT_ICON}</button>
    <button type="button" class="btn btn-icon" data-toggle-archive-account="${a.id}" aria-label="${escapeHtml(a.archived ? l.unarchiveAria : l.archiveAria)}">${icon("archive")}</button>
    <button type="button" class="btn btn-icon" style="color:var(--color-expense-700)" data-delete-account="${a.id}" aria-label="${escapeHtml(l.deleteAria)}">${DELETE_ICON}</button>`;
  return manageRowHtml(iconHtml, a.name, a.archived ? l.archivedLabel : "", fmtMoney(computeBalance(a.id)), "", "", a.archived ? "manage-row-archived" : null, actions, 3);
}
// Same guard shape as deleteCategory above: block (toast, no state change,
// exact count) rather than orphan a transaction's accountId or cascade the
// delete -- transactions/toAccountId have no FK/cascade of their own (see
// the accounts migration's own comment), so silently allowing this would
// leave dangling references with no clean fallback the way a stale
// category name at least degrades to plain text.
function accountUsageCount(accountId) {
  return transactions.filter((t) => t.accountId === accountId || t.toAccountId === accountId).length;
}
export function deleteAccount(id) {
  const a = accounts.find((x) => x.id === id);
  if (!a) return;
  const usage = accountUsageCount(id);
  if (usage > 0) { showToast(L().toastAccountInUse.replace("{n}", usage)); return; }
  if (!a.archived && accounts.filter((x) => !x.archived).length <= 1) {
    showToast(L().toastAccountArchiveBlocked);
    return;
  }
  setAccounts(accounts.filter((x) => x.id !== id));
  saveSettings();
  if (state.accountEditId === id) state.accountEditId = null;
  renderSettings();
  a.updatedAt = Date.now();
  pushRows("accounts", [accountToRow(a, true)]).then(() => syncNow());
  showToast(L().toastAccountDeleted, () => {
    const restored = Object.assign({}, a, { updatedAt: Date.now() });
    accounts.push(restored);
    saveSettings();
    renderSettings();
    pushRows("accounts", [accountToRow(restored, false)]).then(() => syncNow());
  });
}
export function accountFormHtml() {
  const l = L();
  if (!state.accountEditId) return "";
  const isNew = state.accountEditId === "new";
  const editing = !isNew ? accounts.find((a) => a.id === state.accountEditId) : null;
  if (!isNew && !editing) return "";
  const curIcon = isNew ? ACCOUNT_ICON_CHOICES[0] : editing.icon;
  const iconPicker = `<div class="field"><label>${escapeHtml(l.iconLabel)}</label><div class="icon-picker">${ACCOUNT_ICON_CHOICES.map((name) => `<button type="button" class="icon-picker-option${name === curIcon ? " selected" : ""}" data-icon="${name}" aria-label="${escapeHtml(name)}">${icon(name)}</button>`).join("")}</div></div>`;
  const fields = `<div class="field"><label>${escapeHtml(l.accountNameLabel)}</label><input class="input" type="text" id="accountNameInput" value="${isNew ? "" : escapeHtml(editing.name)}"></div>`
    + `<div class="field"><label>${escapeHtml(l.openingBalanceLabel)}</label><input class="input" type="number" id="accountOpeningBalanceInput" step="0.01" value="${isNew ? "0" : editing.openingBalance}"></div>`
    + iconPicker;
  return inlineForm(fields, "saveAccountFormBtn", l.saveAccountBtn, "cancelAccountFormBtn");
}
export function saveAccountForm() {
  const isNew = state.accountEditId === "new";
  const name = ($("accountNameInput") || {}).value ? $("accountNameInput").value.trim() : "";
  if (!name) { showToast(L().toastInvalidAccountName); return; }
  const openingBalance = parseFloat(($("accountOpeningBalanceInput") || {}).value);
  if (Number.isNaN(openingBalance)) { showToast(L().toastInvalidAmount); return; }
  const selectedIconBtn = document.querySelector(".icon-picker-option.selected");
  const iconName = selectedIconBtn ? selectedIconBtn.getAttribute("data-icon") : ACCOUNT_ICON_CHOICES[0];
  let saved;
  if (isNew) {
    saved = { id: uid(), name, icon: iconName, openingBalance, archived: false, updatedAt: Date.now() };
    accounts.push(saved);
  } else {
    const a = accounts.find((x) => x.id === state.accountEditId);
    if (!a) return;
    a.name = name; a.icon = iconName; a.openingBalance = openingBalance; a.updatedAt = Date.now();
    saved = a;
  }
  saveSettings();
  state.accountEditId = null;
  showToast(L().toastAccountSaved);
  renderSettings();
  pushRows("accounts", [accountToRow(saved, false)]).then(() => syncNow());
}
// Blocks (toast, no state change) if archiving would leave zero active
// accounts -- every new transaction needs a real account to save against,
// so at least one must always stay active. No such guard is needed for
// unarchiving, which only ever adds an active account back.
export function toggleArchiveAccount(id) {
  const a = accounts.find((x) => x.id === id);
  if (!a) return;
  if (!a.archived && accounts.filter((x) => !x.archived).length <= 1) {
    showToast(L().toastAccountArchiveBlocked);
    return;
  }
  a.archived = !a.archived;
  a.updatedAt = Date.now();
  saveSettings();
  renderSettings();
  pushRows("accounts", [accountToRow(a, false)]).then(() => syncNow());
  showToast(a.archived ? L().toastAccountArchived : L().toastAccountUnarchived);
}

// Below 1024px, Edit/Delete move behind a swipe (same generalized
// component every other Manage row uses) while Contribute stays an
// always-visible button on the card face -- it's the primary action on a
// savings goal, not housekeeping (docs/specs/settings-manage-swipe-and-
// sheet.md decision 2). The swipe wrapper only ever contains the
// icon+name+badge; Contribute lives outside it as a sibling, so it's
// never hidden and never part of the drag surface.
export function goalCardHtml(g, idx) {
  const l = L();
  const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
  const complete = g.saved >= g.target;
  const tone = GOAL_TONES[idx % GOAL_TONES.length];
  const gIcon = GOAL_ICONS[idx % GOAL_ICONS.length];
  const infoContent = `
    ${iconAvatar(gIcon, tone.bg, tone.color)}
    <div style="flex:1;min-width:0">
      <div class="name">${escapeHtml(g.name)}</div>
      <div class="progress-label">${fmtMoney(g.saved)} ${escapeHtml(l.ofLabel || "/")} ${fmtMoney(g.target)}</div>
    </div>
    <span class="badge ${complete ? "badge-income" : "badge-brand"}">${complete ? escapeHtml(l.goalComplete) : pct + "%"}</span>`;
  const contributeBtn = `<button type="button" class="btn btn-icon" data-contribute-goal="${g.id}" aria-label="${escapeHtml(l.contributeAria)}">${PLUS_ICON}</button>`;
  const editDeleteActions = `
    <button type="button" class="btn btn-icon" data-edit-goal="${g.id}" aria-label="${escapeHtml(l.editAria)}">${EDIT_ICON}</button>
    <button type="button" class="btn btn-icon" style="color:var(--color-expense-700)" data-delete-goal="${g.id}" aria-label="${escapeHtml(l.deleteAria)}">${DELETE_ICON}</button>`;
  const topRow = isDesktopShell()
    ? `${infoContent}<div class="goal-card-actions">${contributeBtn}${editDeleteActions}</div>`
    : `${manageSwipeWrapHtml("", infoContent, editDeleteActions, 2, "goal-card-top-content", "goal-card-swipe-wrap")}${contributeBtn}`;
  return `
    <div class="goal-card">
      <div class="top">${topRow}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${complete ? "var(--color-income)" : tone.color}"></div></div>
      ${state.goalContributeId === g.id && isDesktopShell() ? goalContributeFormHtml() : ""}
    </div>`;
}
export function goalContributeFormHtml() {
  const l = L();
  const fields = `<div class="field"><label>${escapeHtml(l.contributeAmountLabel)}</label><input class="input" type="number" id="goalContributeInput" min="0" step="0.01"></div>`;
  return inlineForm(fields, "saveContributeBtn", l.addFundsBtn, "cancelContributeBtn", "margin:14px 0 0");
}
export function goalFormHtml() {
  const l = L();
  if (!state.goalEditId) return "";
  const isNew = state.goalEditId === "new";
  const editing = !isNew ? goals.find((g) => g.id === state.goalEditId) : null;
  if (!isNew && !editing) return "";
  const fields = `
    <div class="field"><label>${escapeHtml(l.goalNameLabel)}</label><input class="input" type="text" id="goalNameInput" value="${isNew ? "" : escapeHtml(editing.name)}"></div>
    <div class="field"><label>${escapeHtml(l.targetLabel)}</label><input class="input" type="number" id="goalTargetInput" min="0" step="0.01" value="${isNew ? "" : editing.target}"></div>
    <div class="field"><label>${escapeHtml(l.savedLabel)}</label><input class="input" type="number" id="goalSavedInput" min="0" step="0.01" value="${isNew ? "0" : editing.saved}"></div>
  `;
  return inlineForm(fields, "saveGoalFormBtn", l.saveGoalBtn, "cancelGoalFormBtn");
}
export function saveGoalForm() {
  const isNew = state.goalEditId === "new";
  const name = ($("goalNameInput") || {}).value ? $("goalNameInput").value.trim() : "";
  const target = parseFloat(($("goalTargetInput") || {}).value);
  const saved = parseFloat(($("goalSavedInput") || {}).value) || 0;
  if (!name || !target || target <= 0 || saved < 0) { showToast(L().toastInvalidAmount); return; }
  let savedGoal;
  if (isNew) {
    savedGoal = { id: uid(), name, target, saved, updatedAt: Date.now() };
    goals.push(savedGoal);
  } else {
    const g = goals.find((x) => x.id === state.goalEditId);
    if (!g) return;
    g.name = name; g.target = target; g.saved = saved; g.updatedAt = Date.now();
    savedGoal = g;
  }
  saveSettings();
  state.goalEditId = null;
  showToast(L().toastGoalSaved);
  renderSettings();
  pushRows("goals", [goalToRow(savedGoal, false)]).then(() => syncNow());
}
export function deleteGoal(id) {
  const g = goals.find((x) => x.id === id);
  if (!g) return;
  setGoals(goals.filter((x) => x.id !== id));
  saveSettings();
  if (state.goalEditId === id) state.goalEditId = null;
  renderSettings();
  g.updatedAt = Date.now();
  pushRows("goals", [goalToRow(g, true)]).then(() => syncNow());
  showToast(L().toastGoalDeleted, () => {
    const restored = Object.assign({}, g, { updatedAt: Date.now() });
    goals.push(restored);
    saveSettings();
    renderSettings();
    pushRows("goals", [goalToRow(restored, false)]).then(() => syncNow());
  });
}
export function saveContribution() {
  const g = goals.find((x) => x.id === state.goalContributeId);
  const amount = parseFloat(($("goalContributeInput") || {}).value);
  if (!g || !amount || amount <= 0) { showToast(L().toastInvalidAmount); return; }
  g.saved += amount;
  g.updatedAt = Date.now();
  saveSettings();
  state.goalContributeId = null;
  showToast(L().toastFundsAdded);
  renderSettings();
  pushRows("goals", [goalToRow(g, false)]).then(() => syncNow());
}

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

// The three export options (CSV/JSON/Google Sheets) used to be three
// always-visible toggle-rows; now they're one "Export" row that opens a
// bottom sheet, copying Transactions' filter-sheet structure exactly
// (.filter-sheet-backdrop/.filter-sheet, createFocusTrap, Escape-to-close,
// role="dialog") rather than inventing a second sheet mechanism.
function exportSheetHtml() {
  const l = L();
  return `
    <div class="filter-sheet-backdrop" id="exportSheetBackdrop" ${state.exportSheetOpen ? "" : "hidden"}>
      <div class="filter-sheet" role="dialog" aria-label="${escapeHtml(l.exportBtn)}">
        <div class="filter-sheet-header">
          <h3>${escapeHtml(l.exportBtn)}</h3>
          <button type="button" class="filter-sheet-close-btn" id="exportSheetClose" aria-label="${escapeHtml(l.closeAria)}">&times;</button>
        </div>
        <button type="button" class="toggle-row" id="exportCsvBtn">
          ${iconAvatar("download", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
          <span class="label">${escapeHtml(l.exportCsvBtn)}</span>
        </button>
        <button type="button" class="toggle-row" id="exportJsonBtn">
          ${iconAvatar("download", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
          <span class="label">${escapeHtml(l.exportJsonBtn)}</span>
        </button>
        <button type="button" class="toggle-row" id="exportSheetsBtn">
          ${iconAvatar("table", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
          <span class="label">${escapeHtml(l.exportSheetsBtn)}</span>
        </button>
      </div>
    </div>`;
}
// Looked up fresh from the DOM rather than closed over at wire-time, same
// reasoning as transactions.js's closeTxFilterSheet.
function closeExportSheet() {
  state.exportSheetOpen = false;
  const backdrop = document.getElementById("exportSheetBackdrop");
  if (backdrop) backdrop.hidden = true;
  exportSheetFocusTrap.deactivate();
}
// Registered once at module load, not per-render -- renderSettings() runs
// on every navigation to this tab, and a per-render document-level
// listener would pile up indefinitely since nothing ever removes it.
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.exportSheetOpen) closeExportSheet(); });
const exportSheetFocusTrap = createFocusTrap(() => {
  const backdrop = document.getElementById("exportSheetBackdrop");
  return backdrop && !backdrop.hidden ? backdrop.querySelector(".filter-sheet") : null;
});
function wireExportSheet() {
  const backdrop = document.getElementById("exportSheetBackdrop");
  const openBtn = document.getElementById("openExportSheetBtn");
  const closeBtn = document.getElementById("exportSheetClose");
  openBtn.addEventListener("click", () => { state.exportSheetOpen = true; backdrop.hidden = false; exportSheetFocusTrap.activate(); });
  closeBtn.addEventListener("click", closeExportSheet);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeExportSheet(); });
}

export function renderSettings() {
  const l = L();
  const meta = currentUser ? (currentUser.user_metadata || {}) : {};
  const avatarUrl = meta.avatar_url || meta.picture || "";
  const name = accountDisplayName(currentUser, l.notSignedIn);

  $("screen").innerHTML = `
    <h2 class="screen-title" style="margin-bottom:22px">${escapeHtml(l.settingsTitle)}</h2>
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
            ${iconAvatar("moon", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
            <span class="label">${escapeHtml(l.darkModeBtn)}</span>
            <button type="button" class="switch ${state.dark ? "on" : ""}" id="darkSwitch"><span class="thumb"></span></button>
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
          <div style="padding:10px 4px">
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
              ${categories.map(categoryRowHtml).join("") || `<div class="empty-note">${escapeHtml(l.noCategories)}</div>`}
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
  $("darkSwitch").addEventListener("click", () => { state.dark = !state.dark; saveSettings(); applyTheme(); renderScreen(); });
  $("syncNowBtn").addEventListener("click", syncNow);
  if ($("pushReminderSwitch")) $("pushReminderSwitch").addEventListener("click", async () => {
    if (pushReminderState() === "enabled") await disableBillReminders();
    else await enableBillReminders();
    renderSettings();
  });
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
  $("exportCsvBtn").addEventListener("click", function () {
    const l = L();
    const header = [l.csvDate, l.csvType, l.csvCategory, l.csvNote, l.csvAmount];
    const rows = transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).map((t) =>
      [t.date, t.type === "income" ? L().incomeLabel : L().expenseLabel, t.category, t.note || "", t.amount].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(","));
    const blob = new Blob(["﻿" + header.join(",") + "\n" + rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "transactions.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    showToast(L().toastCsv);
    closeExportSheet();
  });
  $("exportJsonBtn").addEventListener("click", function () {
    const blob = new Blob([JSON.stringify(transactions, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "transactions.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    showToast(L().toastJson);
    closeExportSheet();
  });
  $("exportSheetsBtn").addEventListener("click", function () {
    exportToGoogleSheets();
    closeExportSheet();
  });

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
  refreshIcons();
  if (!isDesktopShell()) wireManageRowSwipe($("screen"));
  renderManageSheet();
}
