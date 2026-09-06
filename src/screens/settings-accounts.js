// Settings' Accounts manage-section: row/form HTML plus save/delete/
// archive, split out of settings.js (see that file's own header comment
// for why). Stage 3 of docs/specs/multi-account-support.md.
import { L } from "../i18n.js";
import { state, accounts, setAccounts, transactions } from "../state.js";
import { $, uid, icon, iconAvatar, escapeHtml, fmtMoney, EDIT_ICON, DELETE_ICON } from "../utils.js";
import { rowTone } from "../categories.js";
import { ACCOUNT_ICON_CHOICES } from "../accounts.js";
import { computeBalance } from "../derived.js";
import { saveSettings } from "../storage.js";
import { showToast } from "../toast.js";
import { pushRows, syncNow, accountToRow } from "../sync.js";
import { manageRowHtml, inlineForm, rerenderSettings } from "./manage-row.js";

// Full add/edit/archive over accounts -- deliberately no delete action
// (the original request's "archived flag rather than hard delete"), so the
// row's actions differ from every other manage-row in this file (edit +
// archive/unarchive, not edit + delete) via manageRowHtml's
// actionsOverrideHtml parameter.
export function accountRowHtml(a) {
  const tone = rowTone("expense");
  const iconHtml = iconAvatar(a.icon, tone.bg, tone.color, "sm", 'width="15" height="15"');
  const l = L();
  const actions = `
    <button type="button" class="btn btn-icon manage-swipe-action manage-swipe-edit" data-edit-account="${a.id}" aria-label="${escapeHtml(l.editAria)}">${EDIT_ICON}</button>
    <button type="button" class="btn btn-icon manage-swipe-action manage-swipe-archive" data-toggle-archive-account="${a.id}" aria-label="${escapeHtml(a.archived ? l.unarchiveAria : l.archiveAria)}">${icon("archive")}</button>
    <button type="button" class="btn btn-icon manage-swipe-action manage-swipe-delete" data-delete-account="${a.id}" aria-label="${escapeHtml(l.deleteAria)}">${DELETE_ICON}</button>`;
  return manageRowHtml(iconHtml, a.name, a.archived ? l.archivedLabel : "", fmtMoney(computeBalance(a.id)), "", "", a.archived ? "manage-row-archived" : null, actions, 3);
}
// Same guard shape as deleteCategory: block (toast, no state change,
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
  rerenderSettings();
  a.updatedAt = Date.now();
  pushRows("accounts", [accountToRow(a, true)]).then(() => syncNow());
  showToast(L().toastAccountDeleted, () => {
    const restored = Object.assign({}, a, { updatedAt: Date.now() });
    accounts.push(restored);
    saveSettings();
    rerenderSettings();
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
  rerenderSettings();
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
  rerenderSettings();
  pushRows("accounts", [accountToRow(a, false)]).then(() => syncNow());
  showToast(a.archived ? L().toastAccountArchived : L().toastAccountUnarchived);
}
