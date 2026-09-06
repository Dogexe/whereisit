// Settings' Categories manage-section: row/form HTML plus save/delete,
// split out of settings.js (see that file's own header comment for why).
// Stage 3 of docs/specs/custom-categories.md: full add/edit/delete over
// categories, including today's built-ins -- not just custom additions on
// top of a protected list, per that spec's confirmed requirement.
import { L } from "../i18n.js";
import { state, categories, setCategories, transactions, budgets, bills } from "../state.js";
import { $, uid, escapeHtml, icon, iconAvatar, optionsHtml } from "../utils.js";
import {
  CATEGORY_ICON_CHOICES, rowTone, categoryDisplayName, childrenOf, isParentCategory, eligibleParentOptions
} from "../categories.js";
import { resolveCategoryId } from "../derived.js";
import { saveSettings } from "../storage.js";
import { showToast } from "../toast.js";
import { pushRows, syncNow, categoryToRow } from "../sync.js";
import { manageRowHtml, inlineForm, rerenderSettings } from "./manage-row.js";

export function categoryRowHtml(c) {
  const tone = rowTone(c.type);
  const iconHtml = iconAvatar(c.icon, tone.bg, tone.color);
  const sub = c.type === "income" ? L().incomeLabel : L().expenseLabel;
  return manageRowHtml(iconHtml, c.name, sub, null, `data-edit-category="${c.id}"`, `data-delete-category="${c.id}"`, c.parentId ? "manage-row-child" : null);
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
// docs/specs/category-nesting.md stage 3: parent-category <select>, built
// from eligibleParentOptions (stage 2) so it can never offer a choice that
// would violate the one-level cap. Standalone function (not inlined into
// categoryFormHtml) because it also needs to be re-rendered on its own
// when a new category's type radio changes -- see wireCategoryTypeRadios
// below, matching this app's existing "standalone refresh" precedent
// (renderCategoryChips, renderFormCategoryOptions) rather than
// re-rendering the whole form and losing focus/other field values.
function categoryParentFieldHtml(type, editingId, curParentId) {
  const l = L();
  const locked = editingId && isParentCategory(categories, editingId);
  if (locked) {
    return `<div class="field"><label>${escapeHtml(l.parentCategoryLabel)}</label>`
      + `<div style="font-size:13px;color:var(--color-muted)">${escapeHtml(l.parentLockedHasChildrenNote)}</div></div>`;
  }
  const options = eligibleParentOptions(categories, editingId, type);
  const optHtml = optionsHtml(["", ...options.map((c) => c.id)], curParentId || "",
    (id) => id ? categoryDisplayName(categories, id, id) : l.noParentCategoryOption);
  return `<div class="field"><label>${escapeHtml(l.parentCategoryLabel)}</label><select class="input" id="categoryParentSelect">${optHtml}</select></div>`;
}
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
  const parentField = categoryParentFieldHtml(curType, isNew ? null : editing.id, isNew ? null : editing.parentId);
  const fields = typeField
    + `<div class="field"><label>${escapeHtml(l.categoryNameLabel)}</label><input class="input" type="text" id="categoryNameInput" value="${isNew ? "" : escapeHtml(editing.name)}"></div>`
    + iconPicker
    + parentField;
  return inlineForm(fields, "saveCategoryFormBtn", l.saveCategoryBtn, "cancelCategoryFormBtn");
}
// A new category has no children yet, so its parent field is always the
// live <select> (never the locked note) -- but its type isn't fixed until
// save time, and eligibleParentOptions needs to filter by type. Rather
// than re-rendering the whole form (losing the name input's typed value
// and the icon picker's selection) on every type-radio click, this
// refreshes just the parent select's own options in place, the same
// "standalone refresh" shape as renderCategoryChips/
// renderFormCategoryOptions elsewhere in this app. Wired from both
// desktop's inline form and the mobile manage sheet (renderManageSheet),
// same as the icon-picker click wiring right next to each call site.
export function wireCategoryTypeRadios(container) {
  const select = (container || document).querySelector("#categoryParentSelect");
  if (!select) return;
  (container || document).querySelectorAll('input[name="category-type"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      select.innerHTML = optionsHtml(["", ...eligibleParentOptions(categories, null, radio.value).map((c) => c.id)], "",
        (id) => id ? categoryDisplayName(categories, id, id) : L().noParentCategoryOption);
    });
  });
}
export function saveCategoryForm() {
  const isNew = state.categoryEditId === "new";
  const name = ($("categoryNameInput") || {}).value ? $("categoryNameInput").value.trim() : "";
  if (!name) { showToast(L().toastInvalidCategoryName); return; }
  const selectedIconBtn = document.querySelector(".icon-picker-option.selected");
  const iconName = selectedIconBtn ? selectedIconBtn.getAttribute("data-icon") : CATEGORY_ICON_CHOICES[0];
  // docs/specs/category-nesting.md stage 3: #categoryParentSelect doesn't
  // exist when categoryParentFieldHtml rendered the locked note instead
  // (the category being edited already has children) -- that's exactly
  // the case where parentId must stay null (a category with children is
  // never allowed a parent of its own), so a missing select and "keep it
  // null" agree here, no special-casing needed.
  const parentSelect = $("categoryParentSelect");
  const parentId = parentSelect ? (parentSelect.value || null) : null;
  let saved;
  if (isNew) {
    const typeInput = document.querySelector('input[name="category-type"]:checked');
    const type = typeInput ? typeInput.value : "expense";
    saved = { id: uid(), type, name, icon: iconName, parentId, sortOrder: categories.length, updatedAt: Date.now() };
    categories.push(saved);
  } else {
    const c = categories.find((x) => x.id === state.categoryEditId);
    if (!c) return;
    c.name = name; c.icon = iconName; c.parentId = parentId; c.updatedAt = Date.now();
    saved = c;
  }
  saveSettings();
  state.categoryEditId = null;
  showToast(L().toastCategorySaved);
  rerenderSettings();
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
  // docs/specs/category-nesting.md stage 2: a category with children can't
  // be deleted either, same blocking mechanism (toast naming a count) as
  // the in-use guard right below -- not auto-detached to top-level, per
  // that spec's decision. Checked before the in-use count since a parent
  // category is very likely also in scope for both guards at once and
  // this ordering gives the more structurally specific message.
  const childCount = childrenOf(categories, id).length;
  if (childCount > 0) { showToast(L().toastCategoryHasChildren.replace("{n}", childCount)); return; }
  const usage = categoryUsageCount(id);
  if (usage > 0) { showToast(L().toastCategoryInUse.replace("{n}", usage)); return; }
  setCategories(categories.filter((x) => x.id !== id));
  saveSettings();
  if (state.categoryEditId === id) state.categoryEditId = null;
  rerenderSettings();
  c.updatedAt = Date.now();
  pushRows("categories", [categoryToRow(c, true)]).then(() => syncNow());
  showToast(L().toastCategoryDeleted, () => {
    const restored = Object.assign({}, c, { updatedAt: Date.now() });
    categories.push(restored);
    saveSettings();
    rerenderSettings();
    pushRows("categories", [categoryToRow(restored, false)]).then(() => syncNow());
  });
}
