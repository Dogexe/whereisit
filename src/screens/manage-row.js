// Shared row/form scaffold used by every Settings "Manage" domain
// (budgets/bills/goals/categories/accounts, each split into its own
// settings-*.js module) -- sibling to manage-row-swipe.js, which owns just
// the swipe-to-reveal interaction; this file owns everything else about a
// manage-row's shape (icon+info+amount, edit/delete actions, the shared
// inline-form wrapper, and the add/edit/delete/save/cancel wiring every
// domain's CRUD needs identically).
import { L } from "../i18n.js";
import { state, categories } from "../state.js";
import { $, escapeHtml, iconAvatar, isDesktopShell, EDIT_ICON, DELETE_ICON } from "../utils.js";
import { manageSwipeWrapHtml } from "./manage-row-swipe.js";
import { rowTone, iconFor } from "../categories.js";

// Every domain module's save/delete/etc. needs to trigger a Settings
// re-render after mutating state, the same way settings.js's own
// renderSettings() always did when this code lived there directly -- but
// none of those domain modules can import renderSettings from settings.js
// statically, since settings.js itself imports their row/form HTML back,
// which would make a real import cycle (this codebase avoids those on
// purpose, see CLAUDE.md's "Cross-module callbacks" note). Same "single
// callback, registered once" shape sync.js's old setSyncRerenderCallback
// used before renderScreen moved to router.js and could just be imported
// directly instead -- settings.js has no such cycle-free leaf to depend on
// here (renderSettings itself is the thing being called), so this
// registration is still needed.
let rerender = null;
export function setSettingsRerender(fn) { rerender = fn; }
export function rerenderSettings() { rerender(); }

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
    <button type="button" class="btn btn-icon manage-swipe-action manage-swipe-edit" ${editAttr} aria-label="${escapeHtml(L().editAria)}">${EDIT_ICON}</button>
    <button type="button" class="btn btn-icon manage-swipe-action manage-swipe-delete" ${deleteAttr} aria-label="${escapeHtml(L().deleteAria)}">${DELETE_ICON}</button>`;
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
export function categoryIconAvatar(categoryId, fallbackCategoryName) {
  const tone = rowTone("expense");
  const cat = categories.find((c) => c.id === categoryId);
  const iconName = cat ? cat.icon : iconFor(fallbackCategoryName);
  return iconAvatar(iconName, tone.bg, tone.color);
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
  // The add button now lives inside the section's <summary> (its own
  // header row, not a separate line above the list) -- clicking anywhere
  // in <summary> is a native disclosure toggle, so without preventDefault()
  // here a click would also open/close the <details> as a browser default
  // action, fighting (and on desktop, hiding behind a closed panel) the
  // add flow this handler is trying to start.
  if (addBtn) addBtn.addEventListener("click", (e) => { e.preventDefault(); state[stateKey] = "new"; if (onOpen) onOpen(); rerenderSettings(); });
  document.querySelectorAll(`[data-edit-${tag}]`).forEach((btn) => btn.addEventListener("click", () => {
    state[stateKey] = btn.getAttribute(`data-edit-${tag}`); if (onOpen) onOpen(); rerenderSettings();
  }));
  document.querySelectorAll(`[data-delete-${tag}]`).forEach((btn) => btn.addEventListener("click", () => deleteFn(btn.getAttribute(`data-delete-${tag}`))));
  const saveBtn = $("save" + prefix + "FormBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveFn);
  const cancelBtn = $("cancel" + prefix + "FormBtn");
  if (cancelBtn) cancelBtn.addEventListener("click", () => { state[stateKey] = null; rerenderSettings(); });
}
