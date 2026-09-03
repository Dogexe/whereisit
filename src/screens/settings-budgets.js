// Settings' Budgets manage-section: row/form HTML plus save/delete, split
// out of settings.js (see that file's own header comment for why). Shares
// row/form scaffolding with every other manage-section via manage-row.js.
import { L } from "../i18n.js";
import { state, budgets, setBudgets, categories } from "../state.js";
import { $, uid, escapeHtml, fmtMoney, optionsHtml } from "../utils.js";
import { categoryDisplayName } from "../categories.js";
import { resolveCategoryId } from "../derived.js";
import { saveSettings } from "../storage.js";
import { showToast } from "../toast.js";
import { pushRows, syncNow, budgetToRow } from "../sync.js";
import { manageRowHtml, categoryIconAvatar, inlineForm, rerenderSettings } from "./manage-row.js";

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
  rerenderSettings();
  pushRows("budgets", [budgetToRow(saved, false)]).then(() => syncNow());
}
export function deleteBudget(id) {
  const b = budgets.find((x) => x.id === id);
  if (!b) return;
  setBudgets(budgets.filter((x) => x.id !== id));
  saveSettings();
  if (state.budgetEditId === id) state.budgetEditId = null;
  rerenderSettings();
  b.updatedAt = Date.now();
  pushRows("budgets", [budgetToRow(b, true)]).then(() => syncNow());
  showToast(L().toastBudgetDeleted, () => {
    const restored = Object.assign({}, b, { updatedAt: Date.now() });
    budgets.push(restored);
    saveSettings();
    rerenderSettings();
    pushRows("budgets", [budgetToRow(restored, false)]).then(() => syncNow());
  });
}
