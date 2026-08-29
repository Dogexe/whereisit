import { L } from "../i18n.js";
import { state, transactions, budgets, bills, goals, categories, setBudgets, setBills, setGoals, setCategories } from "../state.js";
import {
  $, uid, icon, iconAvatar, escapeHtml, fmtMoney, optionsHtml, refreshIcons,
  EDIT_ICON, DELETE_ICON, PLUS_ICON
} from "../utils.js";
import { CATEGORY_ICON_CHOICES, GOAL_TONES, GOAL_ICONS, iconFor, rowTone, categoryDisplayName } from "../categories.js";
import { accountDisplayName } from "../account.js";
import { daysUntilBillDue, dueSoonLabel, resolveCategoryId } from "../derived.js";
import { saveSettings } from "../storage.js";
import { applyTheme } from "../theme.js";
import {
  currentUser, lastSyncStatus, signInWithGoogle, signOutUser, syncNow,
  budgetToRow, billToRow, goalToRow, categoryToRow, pushRows
} from "../sync.js";
import { showToast } from "../toast.js";
import { renderChrome, renderScreen } from "./router.js";
import { deferredInstallPrompt, setDeferredInstallPrompt } from "../pwa-install.js";
import { exportToGoogleSheets } from "../sheets-export.js";
import { pushReminderState, enableBillReminders, disableBillReminders } from "../push.js";

// Both are simple named lists edited inline in Settings; share one row/CRUD shape.
// `iconHtml` is a pre-built iconAvatar() string -- category icon for
// budgets/bills, matching the same icon-led row shape as every other
// row in this redesigned Settings screen (toggle rows, group headers,
// transaction rows) instead of being the one bare-text exception.
export function manageRowHtml(iconHtml, name, sub, amt, editAttr, deleteAttr, extraClass) {
  return `
    <div class="manage-row${extraClass ? " " + extraClass : ""}">
      ${iconHtml}
      <div class="info"><div class="name">${escapeHtml(name)}</div><div class="sub">${escapeHtml(sub)}</div></div>
      ${amt ? `<div class="amt">${amt}</div>` : ""}
      <div class="row-actions">
        <button type="button" class="btn btn-icon" ${editAttr} aria-label="${escapeHtml(L().editAria)}">${EDIT_ICON}</button>
        <button type="button" class="btn btn-icon" style="color:var(--color-expense-700)" ${deleteAttr} aria-label="${escapeHtml(L().deleteAria)}">${DELETE_ICON}</button>
      </div>
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

export function goalCardHtml(g, idx) {
  const l = L();
  const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
  const complete = g.saved >= g.target;
  const tone = GOAL_TONES[idx % GOAL_TONES.length];
  const gIcon = GOAL_ICONS[idx % GOAL_ICONS.length];
  return `
    <div class="goal-card">
      <div class="top">
        ${iconAvatar(gIcon, tone.bg, tone.color)}
        <div style="flex:1;min-width:0">
          <div class="name">${escapeHtml(g.name)}</div>
          <div class="progress-label">${fmtMoney(g.saved)} ${escapeHtml(l.ofLabel || "/")} ${fmtMoney(g.target)}</div>
        </div>
        <span class="badge ${complete ? "badge-income" : "badge-brand"}">${complete ? escapeHtml(l.goalComplete) : pct + "%"}</span>
        <div class="goal-card-actions">
          <button type="button" class="btn btn-icon" data-contribute-goal="${g.id}" aria-label="${escapeHtml(l.contributeAria)}">${PLUS_ICON}</button>
          <button type="button" class="btn btn-icon" data-edit-goal="${g.id}" aria-label="${escapeHtml(l.editAria)}">${EDIT_ICON}</button>
          <button type="button" class="btn btn-icon" style="color:var(--color-expense-700)" data-delete-goal="${g.id}" aria-label="${escapeHtml(l.deleteAria)}">${DELETE_ICON}</button>
        </div>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${complete ? "var(--color-income)" : tone.color}"></div></div>
      ${state.goalContributeId === g.id ? goalContributeFormHtml() : ""}
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
        <button type="button" class="btn btn-secondary btn-sm" id="authBtn">${escapeHtml(currentUser ? l.signOutBtn : l.signInGoogle)}</button>
      </div>

      <div class="settings-layout" data-active="${state.settingsActiveSection}">
        <nav class="settings-nav" aria-label="${escapeHtml(l.settingsTitle)}">
          <button type="button" class="settings-nav-item${state.settingsActiveSection === "display" ? " active" : ""}" data-settings-section="display">${iconAvatar("languages", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}<span>${escapeHtml(l.displaySection)}</span></button>
          <button type="button" class="settings-nav-item${state.settingsActiveSection === "sync" ? " active" : ""}" data-settings-section="sync">${iconAvatar("cloud", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}<span>${escapeHtml(l.syncSection)}</span></button>
          <button type="button" class="settings-nav-item${state.settingsActiveSection === "budgets" ? " active" : ""}" data-settings-section="budgets">${iconAvatar("wallet", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}<span>${escapeHtml(l.budgetsSection)}</span></button>
          <button type="button" class="settings-nav-item${state.settingsActiveSection === "bills" ? " active" : ""}" data-settings-section="bills">${iconAvatar("receipt", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}<span>${escapeHtml(l.billsSection)}</span></button>
          <button type="button" class="settings-nav-item${state.settingsActiveSection === "goals" ? " active" : ""}" data-settings-section="goals">${iconAvatar("target", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}<span>${escapeHtml(l.goalsSection)}</span></button>
          <button type="button" class="settings-nav-item${state.settingsActiveSection === "categories" ? " active" : ""}" data-settings-section="categories">${iconAvatar("layout-grid", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}<span>${escapeHtml(l.categoriesSection)}</span></button>
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
      </div>

      <div data-settings-panel="manage">
        <div class="settings-section-label">${escapeHtml(l.manageSection)}</div>
        <div class="list-card">
          <details class="settings-group" data-group="budgets" ${state.settingsGroupOpen.budgets ? "open" : ""}>
            <summary>
              ${iconAvatar("wallet", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
              <span class="label">${escapeHtml(l.budgetsSection)}</span>
              <span class="settings-badge-count">${budgets.length}</span>
              ${icon("chevron-right")}
            </summary>
            <div class="settings-group-body">
              <div style="text-align:right;margin-bottom:10px">
                <button type="button" class="btn btn-ghost" id="addBudgetBtn">${escapeHtml(l.addBudgetBtn)}</button>
              </div>
              <div id="budgetFormSlot">${budgetFormHtml()}</div>
              ${budgets.map(budgetRowHtml).join("") || `<div class="empty-note">${escapeHtml(l.noBudgets)}</div>`}
            </div>
          </details>
          <details class="settings-group" data-group="bills" ${state.settingsGroupOpen.bills ? "open" : ""}>
            <summary>
              ${iconAvatar("receipt", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
              <span class="label">${escapeHtml(l.billsSection)}</span>
              <span class="settings-badge-count">${bills.length}</span>
              ${icon("chevron-right")}
            </summary>
            <div class="settings-group-body">
              <div style="text-align:right;margin-bottom:10px">
                <button type="button" class="btn btn-ghost" id="addBillBtn">${escapeHtml(l.addBillBtn)}</button>
              </div>
              <div id="billFormSlot">${billFormHtml()}</div>
              ${bills.map(billRowHtml).join("") || `<div class="empty-note">${escapeHtml(l.noBills)}</div>`}
            </div>
          </details>
          <details class="settings-group" data-group="goals" ${state.settingsGroupOpen.goals ? "open" : ""}>
            <summary>
              ${iconAvatar("target", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
              <span class="label">${escapeHtml(l.goalsSection)}</span>
              <span class="settings-badge-count">${goals.length}</span>
              ${icon("chevron-right")}
            </summary>
            <div class="settings-group-body">
              <div style="text-align:right;margin-bottom:10px">
                <button type="button" class="btn btn-ghost" id="addGoalBtn">${escapeHtml(l.addGoalBtn)}</button>
              </div>
              <div id="goalFormSlot">${state.goalEditId ? goalFormHtml() : ""}</div>
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
              ${icon("chevron-right")}
            </summary>
            <div class="settings-group-body">
              <div style="text-align:right;margin-bottom:10px">
                <button type="button" class="btn btn-ghost" id="addCategoryBtn">${escapeHtml(l.addCategoryBtn)}</button>
              </div>
              <div id="categoryFormSlot">${categoryFormHtml()}</div>
              ${categories.map(categoryRowHtml).join("") || `<div class="empty-note">${escapeHtml(l.noCategories)}</div>`}
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
  $("exportCsvBtn").addEventListener("click", function () {
    const l = L();
    const header = [l.csvDate, l.csvType, l.csvCategory, l.csvNote, l.csvAmount];
    const rows = transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).map((t) =>
      [t.date, t.type === "income" ? L().incomeLabel : L().expenseLabel, t.category, t.note || "", t.amount].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(","));
    const blob = new Blob(["﻿" + header.join(",") + "\n" + rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "transactions.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    showToast(L().toastCsv);
  });
  $("exportJsonBtn").addEventListener("click", function () {
    const blob = new Blob([JSON.stringify(transactions, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "transactions.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    showToast(L().toastJson);
  });
  $("exportSheetsBtn").addEventListener("click", exportToGoogleSheets);

  wireInlineCrud("Budget", "budgetEditId", deleteBudget, saveBudgetForm);
  wireInlineCrud("Bill", "billEditId", deleteBill, saveBillForm);
  wireInlineCrud("Goal", "goalEditId", deleteGoal, saveGoalForm, () => { state.goalContributeId = null; });
  document.querySelectorAll("[data-contribute-goal]").forEach((btn) => btn.addEventListener("click", () => { state.goalContributeId = btn.getAttribute("data-contribute-goal"); state.goalEditId = null; renderSettings(); }));
  if ($("saveContributeBtn")) $("saveContributeBtn").addEventListener("click", saveContribution);
  if ($("cancelContributeBtn")) $("cancelContributeBtn").addEventListener("click", () => { state.goalContributeId = null; renderSettings(); });
  wireInlineCrud("Category", "categoryEditId", deleteCategory, saveCategoryForm);
  // Pure DOM toggling, not a re-render -- the picker's selection is only
  // ever read (via the .selected class) at save time in saveCategoryForm,
  // same as every other field in this form reading straight from the DOM.
  document.querySelectorAll(".icon-picker-option").forEach((btn) => btn.addEventListener("click", () => {
    btn.parentElement.querySelectorAll(".icon-picker-option").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
  }));
  refreshIcons();
}
