// Settings' Goals manage-section: row/form HTML plus save/delete/
// contribute, split out of settings.js (see that file's own header comment
// for why). Goal cards have their own shape (not the generic manageRowHtml
// scaffold every other domain uses), but still share inlineForm and the
// swipe wrapper with the rest of Settings.
import { L } from "../i18n.js";
import { state, goals, setGoals } from "../state.js";
import { $, uid, escapeHtml, fmtMoney, iconAvatar, isDesktopShell, EDIT_ICON, DELETE_ICON, PLUS_ICON } from "../utils.js";
import { GOAL_TONES, GOAL_ICONS } from "../categories.js";
import { saveSettings } from "../storage.js";
import { showToast } from "../toast.js";
import { pushRows, syncNow, goalToRow } from "../sync.js";
import { manageSwipeWrapHtml } from "./manage-row-swipe.js";
import { inlineForm, rerenderSettings } from "./manage-row.js";

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
    <button type="button" class="btn btn-icon manage-swipe-action manage-swipe-edit" data-edit-goal="${g.id}" aria-label="${escapeHtml(l.editAria)}">${EDIT_ICON}</button>
    <button type="button" class="btn btn-icon manage-swipe-action manage-swipe-delete" data-delete-goal="${g.id}" aria-label="${escapeHtml(l.deleteAria)}">${DELETE_ICON}</button>`;
  const topRow = isDesktopShell()
    ? `${infoContent}<div class="goal-card-actions">${contributeBtn}${editDeleteActions}</div>`
    : `${manageSwipeWrapHtml("", infoContent, editDeleteActions, 2, "goal-card-top-content", "goal-card-swipe-wrap")}${contributeBtn}`;
  return `
    <div class="goal-card">
      <div class="top">${topRow}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${complete ? "var(--color-income-700)" : tone.color}"></div></div>
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
  rerenderSettings();
  pushRows("goals", [goalToRow(savedGoal, false)]).then(() => syncNow());
}
export function deleteGoal(id) {
  const g = goals.find((x) => x.id === id);
  if (!g) return;
  setGoals(goals.filter((x) => x.id !== id));
  saveSettings();
  if (state.goalEditId === id) state.goalEditId = null;
  rerenderSettings();
  g.updatedAt = Date.now();
  pushRows("goals", [goalToRow(g, true)]).then(() => syncNow());
  showToast(L().toastGoalDeleted, () => {
    const restored = Object.assign({}, g, { updatedAt: Date.now() });
    goals.push(restored);
    saveSettings();
    rerenderSettings();
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
  rerenderSettings();
  pushRows("goals", [goalToRow(g, false)]).then(() => syncNow());
}
