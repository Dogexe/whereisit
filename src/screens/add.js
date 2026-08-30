import { L } from "../i18n.js";
import { state, transactions, categories, setTransactions } from "../state.js";
import { $, uid, escapeHtml, dateLabel, formatDateTyping, parseDateText, optionsHtml, refreshIcons, icon, isDesktopShell, createFocusTrap } from "../utils.js";
import { guessCategory, categoryDisplayName } from "../categories.js";
import { checkBudgetAlert, resolveCategoryId, mostUsedCategoryIds } from "../derived.js";
import { saveToStorage } from "../storage.js";
import { pushTx, pushDeleteTx, syncNow } from "../sync.js";
import { showToast } from "../toast.js";
import { setTab, renderScreen } from "./router.js";

// Stage 4 of docs/specs/custom-categories.md: the form tracks a
// categoryId now, not a category name -- the Add screen is the last
// place in the app that still only wrote the plain .category string at
// creation time (Settings' budget/bill forms already moved to this in
// stage 3). New transactions write both categoryId and a .category name
// snapshot (for the old text column / any not-yet-migrated display code,
// stage 5).
export function resetForm() {
  state.formType = "expense";
  state.formDate = new Date().toISOString().slice(0, 10);
  state.formCategoryId = (categories.find((c) => c.type === "expense") || {}).id || null;
  state.editingId = null;
  state.categoryManual = false;
}
// docs/specs/add-transaction-bottom-sheet.md: below the desktop
// breakpoint, editing opens the bottom sheet in place rather than
// navigating away to the old full-page screen; desktop keeps navigating
// exactly as before.
export function editTx(id) {
  const tx = transactions.find((t) => t.id === id);
  if (!tx) return;
  state.editingId = id;
  state.formType = tx.type;
  state.formDate = tx.date;
  state.formCategoryId = resolveCategoryId(tx, tx.type);
  state.categoryManual = true;
  if (isDesktopShell()) { setTab("add"); return; }
  openAddSheet();
}
export function deleteTx(id) {
  if (state.editingId === id) resetForm();
  const tx = transactions.find((t) => t.id === id);
  if (!tx) return;
  setTransactions(transactions.filter((t) => t.id !== id));
  saveToStorage();
  renderScreen();
  tx.updatedAt = Date.now();
  pushDeleteTx(tx).then(() => syncNow());
  showToast(L().toastDeleted, () => {
    const restored = Object.assign({}, tx, { updatedAt: Date.now() });
    transactions.push(restored);
    saveToStorage();
    renderScreen();
    pushTx(restored).then(() => syncNow());
  });
}
export function renderFormCategoryOptions(select) {
  const opts = categories.filter((c) => c.type === state.formType);
  select.innerHTML = optionsHtml(opts.map((c) => c.id), state.formCategoryId, (id) => categoryDisplayName(categories, id, id));
}
// docs/specs/category-icon-chips.md: standalone (not folded into
// renderAdd) so a chip click / note-guess / select change can refresh
// just the chip row + <select> visibility, not the whole form -- a full
// renderAdd() would blow away the amount/note fields' values and focus.
const CHIP_COUNT = 5;
export function renderCategoryChips() {
  const l = L();
  const opts = categories.filter((c) => c.type === state.formType && !c.deleted);
  const topIds = mostUsedCategoryIds(state.formType, CHIP_COUNT);
  const selectedId = state.formCategoryId;
  const selectedInChips = topIds.includes(selectedId);
  const chipsHtml = topIds.map((id) => {
    const c = opts.find((x) => x.id === id);
    if (!c) return "";
    return `<button type="button" class="category-chip${id === selectedId ? " active" : ""}" data-chip="${id}">${icon(c.icon)}<span>${escapeHtml(c.name)}</span></button>`;
  }).join("");
  const moreActive = !selectedInChips;
  const moreLabel = moreActive ? categoryDisplayName(categories, selectedId, l.moreCategoriesBtn) : l.moreCategoriesBtn;
  $("categoryChipRow").innerHTML = chipsHtml +
    `<button type="button" class="category-chip category-chip-more${moreActive ? " active" : ""}" id="categoryMoreChip">${icon("more-horizontal")}<span>${escapeHtml(moreLabel)}</span></button>`;
  $("txCategory").classList.toggle("category-select-collapsed", !moreActive);
  document.querySelectorAll("[data-chip]").forEach((btn) => btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-chip");
    state.formCategoryId = id;
    state.categoryManual = true;
    $("txCategory").value = id;
    renderCategoryChips();
  }));
  $("categoryMoreChip").addEventListener("click", () => {
    const select = $("txCategory");
    select.classList.remove("category-select-collapsed");
    if (typeof select.showPicker === "function") { try { select.showPicker(); } catch (e) { select.focus(); } }
    else select.focus();
  });
  refreshIcons();
}
// Shared by the desktop full-page screen (renderAdd) and the mobile
// bottom sheet (renderAddSheet, docs/specs/add-transaction-bottom-sheet.md)
// so the ~100 lines of form markup/validation/category-guessing exist
// once, not twice in slow drift. Only the surrounding chrome (a
// screen-title vs. a sheet header+close button) and what happens after
// save/cancel differ between the two callers.
function addFormFieldsHtml(l, isEditing) {
  return `
    <form class="add-form" id="addForm">
      <div class="field">
        <label>${escapeHtml(l.typeLabel)}</label>
        <div class="tabs block" role="radiogroup">
          <label class="tab-opt"><input type="radio" name="form-type" value="expense" ${state.formType === "expense" ? "checked" : ""}>${escapeHtml(l.expenseLabel)}</label>
          <label class="tab-opt"><input type="radio" name="form-type" value="income" ${state.formType === "income" ? "checked" : ""}>${escapeHtml(l.incomeLabel)}</label>
        </div>
      </div>
      <div class="field">
        <label for="txDateText">${escapeHtml(l.dateLabel)}</label>
        <div class="date-input-wrap">
          <div class="input-wrap">
            <input type="text" id="txDateText" inputmode="numeric" placeholder="dd/mm/yyyy" maxlength="10" value="${dateLabel(state.formDate)}" required>
          </div>
          <svg class="date-icon icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <input class="date-native-overlay" type="date" id="txDateNative" value="${state.formDate}" tabindex="-1" aria-hidden="true">
        </div>
      </div>
      <div class="field">
        <label>${escapeHtml(l.categoryLabel)}</label>
        <div class="category-chip-row" id="categoryChipRow"></div>
        <select class="input" id="txCategory" required></select>
      </div>
      <div class="field">
        <label for="txAmount">${escapeHtml(l.amountLabel)}</label>
        <div class="input-wrap"><span class="prefix">฿</span><input type="number" id="txAmount" step="0.01" placeholder="0.00"></div>
      </div>
      <div class="field">
        <label for="txNote">${escapeHtml(l.noteLabel)}</label>
        <div class="input-wrap"><input type="text" id="txNote" placeholder="${escapeHtml(l.notePlaceholder)}"></div>
      </div>
      <button type="submit" class="btn btn-primary btn-block">${escapeHtml(isEditing ? l.saveEditBtn : l.saveBtn)}</button>
      ${isEditing ? `<button type="button" class="btn btn-secondary btn-block" id="cancelEditBtn">${escapeHtml(l.cancelEditBtn)}</button>` : ""}
    </form>
  `;
}
// handlers: { onSaved(), onCancelled() } -- called after a successful
// submit / the cancel-edit button, respectively. Neither handler is
// responsible for resetForm() itself; each caller's own callback decides
// when to reset (both current callers do it immediately). Call once
// after addFormFieldsHtml()'s markup is in the DOM.
function wireAddForm({ onSaved, onCancelled }) {
  const isEditing = !!state.editingId;
  renderFormCategoryOptions($("txCategory"));
  renderCategoryChips();
  if (isEditing) {
    const tx = transactions.find((t) => t.id === state.editingId);
    if (tx) { $("txAmount").value = tx.amount; $("txNote").value = tx.note || ""; }
  }
  document.querySelectorAll('input[name="form-type"]').forEach((r) => r.addEventListener("change", (e) => {
    state.formType = e.target.value;
    const guess = state.categoryManual ? state.formCategoryId : guessCategory($("txNote").value, state.formType);
    const opts = categories.filter((c) => c.type === state.formType);
    const guessValid = guess && opts.some((c) => c.id === guess);
    state.formCategoryId = guessValid ? guess : (opts[0] || {}).id || null;
    renderFormCategoryOptions($("txCategory"));
    renderCategoryChips();
  }));
  $("txCategory").addEventListener("change", (e) => { state.formCategoryId = e.target.value; state.categoryManual = true; renderCategoryChips(); });
  $("txDateText").addEventListener("input", function () { this.value = formatDateTyping(this.value); });
  $("txDateText").addEventListener("change", function () {
    const iso = parseDateText(this.value);
    if (iso) { state.formDate = iso; $("txDateNative").value = iso; }
    else { this.value = dateLabel(state.formDate); }
  });
  $("txDateNative").addEventListener("change", function () {
    if (this.value) { state.formDate = this.value; $("txDateText").value = dateLabel(this.value); }
  });
  $("txAmount").addEventListener("input", function () {
    this.closest(".input-wrap").classList.remove("has-error");
    this.removeAttribute("aria-invalid");
  });
  $("txNote").addEventListener("input", function () {
    if (state.categoryManual) return;
    const guess = guessCategory(this.value, state.formType);
    if (guess) { state.formCategoryId = guess; $("txCategory").value = guess; renderCategoryChips(); }
  });
  if (isEditing) $("cancelEditBtn").addEventListener("click", onCancelled);
  $("addForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const date = state.formDate;
    const amount = parseFloat($("txAmount").value);
    if (!date || !amount || amount <= 0) {
      $("txAmount").closest(".input-wrap").classList.add("has-error");
      $("txAmount").setAttribute("aria-invalid", "true");
      showToast(L().toastInvalidAmount);
      return;
    }
    const note = $("txNote").value.trim();
    const categoryId = $("txCategory").value;
    const category = categoryDisplayName(categories, categoryId, "");
    let savedTx = null;
    if (state.editingId) {
      const idx = transactions.findIndex((t) => t.id === state.editingId);
      if (idx >= 0) {
        transactions[idx] = Object.assign({}, transactions[idx], { type: state.formType, date, category, categoryId, amount, note, updatedAt: Date.now() });
        savedTx = transactions[idx];
      }
      showToast(L().toastEdited);
    } else {
      savedTx = { id: uid(), type: state.formType, date, category, categoryId, amount, note, updatedAt: Date.now() };
      transactions.push(savedTx);
      showToast(checkBudgetAlert(savedTx) || L().toastAdded);
    }
    saveToStorage();
    onSaved();
    if (savedTx) pushTx(savedTx).then(() => syncNow());
  });
  refreshIcons();
}
// Desktop (>=1024px) full-page screen -- unchanged behavior from before
// docs/specs/add-transaction-bottom-sheet.md, just built on the shared
// functions above instead of its own inline copy.
export function renderAdd() {
  const l = L();
  const isEditing = !!state.editingId;
  $("screen").innerHTML = `
    <h2 class="screen-title">${escapeHtml(isEditing ? l.editTitle : l.addTitle)}</h2>
    ${addFormFieldsHtml(l, isEditing)}
  `;
  wireAddForm({
    onSaved: () => { resetForm(); setTab("transactions"); },
    onCancelled: () => { resetForm(); setTab("transactions"); }
  });
}
// Mobile (<1024px) bottom sheet -- docs/specs/add-transaction-bottom-sheet.md.
// Lives in index.html's standalone #addSheetContainer, not #screen, so it
// can be opened from any screen without that screen owning its lifecycle
// (mirrors transactions.js's Filters sheet pattern, but that one is
// embedded in its one owning screen since Filters never needs to open
// from anywhere else).
function renderAddSheet() {
  const l = L();
  const isEditing = !!state.editingId;
  const container = $("addSheetContainer");
  container.innerHTML = `
    <div class="filter-sheet-backdrop" id="addSheetBackdrop" ${state.addSheetOpen ? "" : "hidden"}>
      <div class="filter-sheet" role="dialog" aria-label="${escapeHtml(isEditing ? l.editTitle : l.addTitle)}">
        <div class="filter-sheet-header">
          <h3>${escapeHtml(isEditing ? l.editTitle : l.addTitle)}</h3>
          <button type="button" class="filter-sheet-close-btn" id="addSheetClose" aria-label="${escapeHtml(l.closeAria)}">&times;</button>
        </div>
        ${addFormFieldsHtml(l, isEditing)}
      </div>
    </div>
  `;
  // Backdrop tap, the close button, and Escape (below) all converge on
  // this same silent-discard dismissal -- matching the Filters sheet,
  // there's no "unsaved changes" confirmation.
  const dismiss = () => { resetForm(); closeAddSheet(); };
  $("addSheetClose").addEventListener("click", dismiss);
  const backdrop = $("addSheetBackdrop");
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) dismiss(); });
  wireAddForm({
    onSaved: () => { resetForm(); closeAddSheet(); renderScreen(); },
    onCancelled: dismiss
  });
}
export function openAddSheet() {
  state.addSheetOpen = true;
  renderAddSheet();
  addSheetFocusTrap.activate();
}
export function closeAddSheet() {
  state.addSheetOpen = false;
  const backdrop = $("addSheetBackdrop");
  if (backdrop) backdrop.hidden = true;
  addSheetFocusTrap.deactivate();
}
// Registered once at module load, not per-render -- see transactions.js's
// identical pattern/reasoning for its own Filters-sheet Escape listener.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.addSheetOpen) { resetForm(); closeAddSheet(); }
});
const addSheetFocusTrap = createFocusTrap(() => {
  const backdrop = $("addSheetBackdrop");
  return backdrop && !backdrop.hidden ? backdrop.querySelector(".filter-sheet") : null;
});
