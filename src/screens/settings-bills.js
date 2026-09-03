// Settings' Bills manage-section: row/form HTML plus save/delete, split
// out of settings.js (see that file's own header comment for why). Shares
// row/form scaffolding with every other manage-section via manage-row.js.
import { L } from "../i18n.js";
import { state, bills, setBills, categories } from "../state.js";
import { $, uid, escapeHtml, fmtMoney, optionsHtml } from "../utils.js";
import { categoryDisplayName } from "../categories.js";
import { daysUntilBillDue, dueSoonLabel, resolveCategoryId } from "../derived.js";
import { saveSettings } from "../storage.js";
import { showToast } from "../toast.js";
import { pushRows, syncNow, billToRow } from "../sync.js";
import { manageRowHtml, categoryIconAvatar, inlineForm, rerenderSettings } from "./manage-row.js";

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
  rerenderSettings();
  pushRows("bills", [billToRow(saved, false)]).then(() => syncNow());
}
export function deleteBill(id) {
  const b = bills.find((x) => x.id === id);
  if (!b) return;
  setBills(bills.filter((x) => x.id !== id));
  saveSettings();
  if (state.billEditId === id) state.billEditId = null;
  rerenderSettings();
  b.updatedAt = Date.now();
  pushRows("bills", [billToRow(b, true)]).then(() => syncNow());
  showToast(L().toastBillDeleted, () => {
    const restored = Object.assign({}, b, { updatedAt: Date.now() });
    bills.push(restored);
    saveSettings();
    rerenderSettings();
    pushRows("bills", [billToRow(restored, false)]).then(() => syncNow());
  });
}
