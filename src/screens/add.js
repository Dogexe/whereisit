import { L } from "../i18n.js";
import { state, transactions, categories, accounts, setTransactions } from "../state.js";
import { $, uid, escapeHtml, dateLabel, formatDateTyping, parseDateText, optionsHtml, icon, iconAvatar, fmtMoney, isDesktopShell, createFocusTrap, localDateIso, sheetGrabberHtml, wireSheetDrag } from "../utils.js";
import { guessCategory, categoryDisplayName, groupedCategories, rowTone } from "../categories.js";
import { accountNameById } from "../accounts.js";
import { checkBudgetAlert, resolveCategoryId, mostUsedCategoryIds, defaultAccountId } from "../derived.js";
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
// Stage 2 of docs/specs/account-transfers.md: defaults the Transfer tab's
// "To" picker to the first active account that ISN'T the current "From"
// selection -- picking the same account for both would be immediately
// invalid, so defaulting to something already different avoids the user
// having to fix that every single time they open the tab.
function defaultToAccountId(fromId) {
  const active = accounts.filter((a) => !a.archived && a.id !== fromId);
  return (active[0] || {}).id || null;
}
export function resetForm() {
  state.formType = "expense";
  state.formDate = localDateIso();
  state.formCategoryId = (categories.find((c) => c.type === "expense") || {}).id || null;
  state.formAccountId = defaultAccountId();
  state.formToAccountId = defaultToAccountId(state.formAccountId);
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
  state.formAccountId = tx.accountId || defaultAccountId();
  state.formToAccountId = tx.toAccountId || defaultToAccountId(state.formAccountId);
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
// docs/specs/category-nesting.md stage 4, decision 3: flat list,
// subcategories indented under their parent -- not a two-step
// parent-then-child picker. A native <select> only ever shows one flat
// option list regardless (no nested <optgroup> support that would also
// keep a parent's own option independently selectable, which decision 2
// requires), so the indentation has to come from the label text itself:
// two non-breaking spaces prefixed onto a child's display name. Grouping
// order comes from groupedCategories (shared with Settings' list, stages
// 3+4 of that spec) rather than the plain type-filtered order this used
// before.
export function renderFormCategoryOptions(select) {
  const opts = groupedCategories(categories.filter((c) => c.type === state.formType));
  select.innerHTML = optionsHtml(opts.map((c) => c.id), state.formCategoryId,
    (id) => {
      const c = categories.find((x) => x.id === id);
      const label = categoryDisplayName(categories, id, id);
      return (c && c.parentId) ? "  " + label : label;
    });
}
// Stage 4 of docs/specs/multi-account-support.md. Excludes archived
// accounts as a target for *new* transactions, except the one currently
// selected -- so opening the edit form for a transaction booked against an
// account that's since been archived still shows it correctly pre-selected
// instead of silently reassigning it to something else the moment the form
// opens.
function renderFormAccountOptions(select) {
  const opts = accounts.filter((a) => !a.archived || a.id === state.formAccountId);
  select.innerHTML = optionsHtml(opts.map((a) => a.id), state.formAccountId, (id) => accountNameById(accounts, id, id));
}
// Same shape as renderFormAccountOptions, for the Transfer tab's To picker.
function renderFormTransferToOptions(select) {
  const opts = accounts.filter((a) => !a.archived || a.id === state.formToAccountId);
  select.innerHTML = optionsHtml(opts.map((a) => a.id), state.formToAccountId, (id) => accountNameById(accounts, id, id));
}
// Chip-style account picker, mirroring renderCategoryChips' visual pattern
// but simpler: unlike categories (which can run into the dozens and need a
// ranked top-N + "more" overflow into the raw <select>), a user's account
// list is always small, so every available account renders as its own chip
// with no truncation or overflow chip needed. The underlying <select>
// stays in the DOM as the actual form control wireAddForm's submit handler
// reads from -- just always visually collapsed, since chips already
// represent every selectable account exhaustively.
//
// Generalized (stage 2 of docs/specs/account-transfers.md) to take a chip
// row/select id pair and a state field name, so the exact same rendering/
// wiring logic drives both the single-account picker (expense/income) and
// the Transfer tab's independent From/To pair -- listeners are scoped to
// each chip row's own container, not document-wide, so wiring the From
// picker can never also attach to the To picker's buttons (both use the
// same [data-account-chip] attribute).
// excludeId (requested after the Transfer tab shipped): renders that one
// account's chip disabled -- used so From can't pick whatever To currently
// holds and vice versa, catching the same-account case at the picker
// itself instead of only after a submit attempt. refresh, when given, is
// called instead of self-re-rendering after a pick -- the Transfer tab's
// pair passes renderTransferAccountChips so picking one side immediately
// updates the other's disabled state too; the plain single-account picker
// has no sibling to keep in sync, so it defaults to re-rendering itself.
function renderAccountChipPicker(chipRowId, selectId, stateKey, excludeId, refresh) {
  const selectedId = state[stateKey];
  const opts = accounts.filter((a) => !a.archived || a.id === selectedId);
  const row = $(chipRowId);
  row.innerHTML = opts.map((a) => {
    const disabled = excludeId != null && a.id === excludeId;
    return `<button type="button" class="account-chip${a.id === selectedId ? " active" : ""}${disabled ? " account-chip-disabled" : ""}" data-account-chip="${a.id}"${disabled ? " disabled" : ""}>${icon(a.icon)}<span>${escapeHtml(a.name)}</span></button>`;
  }).join("");
  row.querySelectorAll("[data-account-chip]:not([disabled])").forEach((btn) => btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-account-chip");
    state[stateKey] = id;
    $(selectId).value = id;
    (refresh || (() => renderAccountChipPicker(chipRowId, selectId, stateKey)))();
    // Shared by the plain account picker and both Transfer chip rows (see
    // callers below) -- also runs harmlessly for the CSV import sheet's
    // reuse of this same picker, since #addCommitPreview simply doesn't
    // exist there (renderCommitPreview no-ops).
    renderCommitPreview();
  }));
}
function renderAccountChips() { renderAccountChipPicker("accountChipRow", "txAccount", "formAccountId"); }
// docs/specs/csv-import.md stage 3: the Import sheet's account picker
// reuses this exact same underlying picker (a hidden <select id="importAccount">
// as the real form value, chips as the visible UI) rather than a second
// implementation -- import-sheet.js renders that select+chip-row container
// and calls this after, same shape as renderAccountChips above.
export function renderImportAccountChips() { renderAccountChipPicker("importAccountChipRow", "importAccount", "importAccountId"); }
// The Transfer tab's From picker reuses formAccountId/txAccount directly --
// a transfer's source account IS its .accountId, the same field every
// other transaction type already uses (see the spec's schema decision), so
// there's no separate "from" state or select to keep in sync.
function renderTransferAccountChips() {
  renderAccountChipPicker("accountChipRow", "txAccount", "formAccountId", state.formToAccountId, renderTransferAccountChips);
  renderAccountChipPicker("transferToChipRow", "txTransferTo", "formToAccountId", state.formAccountId, renderTransferAccountChips);
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
  renderCommitPreview();
}
// docs/specs/add-transaction-bottom-sheet.md phase 2: a live one-line
// summary (icon + category/route + account + signed amount) pinned as the
// sheet's last field, right before the sticky header's always-visible
// Save -- Amount now living at the top (phase 1) means it scrolls out of
// view well before Save is reached, so this restores "what am I about to
// record" without scrolling back up. Pure read of state already tracked
// (formType/formCategoryId/formAccountId/formToAccountId) plus the live
// #txAmount value -- no new state, no new validation. No-ops on desktop,
// which never renders #addCommitPreview.
function renderCommitPreview() {
  const el = $("addCommitPreview");
  if (!el) return;
  const amount = parseFloat($("txAmount").value) || 0;
  const tone = rowTone(state.formType);
  if (state.formType === "transfer") {
    const fromName = accountNameById(accounts, state.formAccountId, "");
    const toName = accountNameById(accounts, state.formToAccountId, "");
    el.innerHTML = `
      ${iconAvatar("arrow-right-left", tone.bg, tone.color, "sm")}
      <div class="info"><div class="cat">${escapeHtml(fromName)} &rarr; ${escapeHtml(toName)}</div></div>
      <div class="amt">${fmtMoney(amount)}</div>`;
    return;
  }
  const cat = categories.find((c) => c.id === state.formCategoryId);
  const catName = categoryDisplayName(categories, state.formCategoryId, "");
  const accName = accountNameById(accounts, state.formAccountId, "");
  const sign = state.formType === "income" ? "+" : "−";
  const amountColor = state.formType === "income" ? "var(--color-income-700)" : "var(--color-text)";
  el.innerHTML = `
    ${iconAvatar(cat ? cat.icon : "circle", tone.bg, tone.color, "sm")}
    <div class="info"><div class="cat">${escapeHtml(catName)}</div><div class="acc">${escapeHtml(accName)}</div></div>
    <div class="amt" style="color:${amountColor}">${sign}${fmtMoney(amount)}</div>`;
}
// Shared by the desktop full-page screen (renderAdd) and the mobile
// bottom sheet (renderAddSheet, docs/specs/add-transaction-bottom-sheet.md)
// so the ~100 lines of form markup/validation/category-guessing exist
// once, not twice in slow drift. Only the surrounding chrome (a
// screen-title vs. a sheet header+close button) and what happens after
// save/cancel differ between the two callers.
// opts.hideBottomButtons: the mobile sheet (renderAddSheet) puts Save/Cancel
// in a sticky header instead (see below) -- easier to reach one-handed and
// never gets covered by the on-screen keypad the way a bottom-of-form button
// can. Desktop's full-page renderAdd() has no such button and keeps the
// original bottom buttons.
// docs/specs/add-transaction-bottom-sheet.md phase 1 (mobile Add-sheet
// hierarchy pass): the sheet leads with Amount -- the one field every
// transaction needs and the only one with no useful default -- and demotes
// Date to a small chip near the bottom, since it's already correct (today)
// on effectively every add. Desktop's full-page form keeps its original
// Type/Date/Category/Account/Amount/Note order and plain field styling
// untouched; only the mobile sheet reorders and re-weights. Reuses
// opts.hideBottomButtons as the "is this the mobile sheet" signal rather
// than adding a second opts flag that would always match it 1:1 -- it's
// already only ever true for the one caller (renderAddSheet) that wants
// this reordering too.
function addFormFieldsHtml(l, isEditing, opts = {}) {
  const isSheet = !!opts.hideBottomButtons;
  const typeField = `
      <div class="field">
        <label>${escapeHtml(l.typeLabel)}</label>
        <div class="tabs block" role="radiogroup">
          <label class="tab-opt"><input type="radio" name="form-type" value="expense" ${state.formType === "expense" ? "checked" : ""}>${escapeHtml(l.expenseLabel)}</label>
          <label class="tab-opt"><input type="radio" name="form-type" value="income" ${state.formType === "income" ? "checked" : ""}>${escapeHtml(l.incomeLabel)}</label>
          <label class="tab-opt"><input type="radio" name="form-type" value="transfer" ${state.formType === "transfer" ? "checked" : ""}>${escapeHtml(l.transferLabel)}</label>
        </div>
      </div>`;
  // Same #txDateText/#txDateNative wiring either way (wireAddForm doesn't
  // care which layout rendered them) -- the sheet variant only drops the
  // visible <label> (replaced by an aria-label on the input itself, same
  // pattern as this app's icon-only buttons) and wraps in .date-compact,
  // which styles.css shrinks to a small pill instead of a full field.
  const dateField = `
      <div class="field${isSheet ? " field-date-compact" : ""}">
        ${isSheet ? "" : `<label for="txDateText">${escapeHtml(l.dateLabel)}</label>`}
        <div class="date-input-wrap${isSheet ? " date-compact" : ""}">
          <div class="input-wrap">
            <input type="text" id="txDateText" inputmode="numeric" placeholder="dd/mm/yyyy" maxlength="10" value="${dateLabel(state.formDate)}" required${isSheet ? ` aria-label="${escapeHtml(l.dateLabel)}"` : ""}>
          </div>
          <svg class="date-icon icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <input class="date-native-overlay" type="date" id="txDateNative" value="${state.formDate}" tabindex="-1" aria-hidden="true">
        </div>
      </div>`;
  const categoryField = `
      <div class="field${state.formType === "transfer" ? " form-field-hidden" : ""}" id="categoryField">
        <label>${escapeHtml(l.categoryLabel)}</label>
        <div class="category-chip-row" id="categoryChipRow"></div>
        <select class="input" id="txCategory" required></select>
      </div>`;
  const accountField = `
      <div class="field">
        <label id="accountFieldLabel">${escapeHtml(state.formType === "transfer" ? l.transferFromLabel : l.accountLabel)}</label>
        <div class="account-chip-row" id="accountChipRow"></div>
        <select class="input account-select-collapsed" id="txAccount" required></select>
      </div>`;
  const transferSwapField = `
      <div class="transfer-swap-row${state.formType === "transfer" ? "" : " form-field-hidden"}" id="transferSwapRow">
        <button type="button" class="btn btn-secondary btn-icon" id="transferSwapBtn" aria-label="${escapeHtml(l.transferSwapAria)}">${icon("arrow-right-left")}</button>
      </div>`;
  const transferToField = `
      <div class="field${state.formType === "transfer" ? "" : " form-field-hidden"}" id="transferToField">
        <label>${escapeHtml(l.transferToLabel)}</label>
        <div class="account-chip-row" id="transferToChipRow"></div>
        <select class="input account-select-collapsed" id="txTransferTo" required></select>
      </div>`;
  // Sheet variant: same #txAmount input the submit handler already reads,
  // just a visually-hidden label (screen readers still get "Amount") and a
  // large centered numeric treatment (.amount-hero-row/-input, styles.css)
  // instead of the standard field styling desktop keeps.
  const amountField = `
      <div class="field${isSheet ? " field-amount-hero" : ""}">
        <label for="txAmount"${isSheet ? ' class="sr-only"' : ""}>${escapeHtml(l.amountLabel)}</label>
        <div class="input-wrap${isSheet ? " amount-hero-row" : ""}"><span class="prefix">฿</span><input type="number" id="txAmount" step="0.01" placeholder="0.00"${isSheet ? ' class="amount-hero-input"' : ""}></div>
      </div>`;
  const noteField = `
      <div class="field">
        <label for="txNote">${escapeHtml(l.noteLabel)}</label>
        <div class="input-wrap"><input type="text" id="txNote" placeholder="${escapeHtml(l.notePlaceholder)}"></div>
      </div>`;
  // Phase 2: a live one-line summary pinned as the sheet's last field --
  // see renderCommitPreview()'s own comment for why this position (right
  // before the sticky header's always-visible Save) beats "above Save"
  // literally, now that Amount lives at the top and scrolls out of view.
  const commitPreviewField = isSheet ? `
      <div class="commit-preview" id="addCommitPreview" aria-live="polite"></div>` : "";
  const bottomButtons = opts.hideBottomButtons ? "" : `
      <button type="submit" class="btn btn-primary btn-block">${escapeHtml(isEditing ? l.saveEditBtn : l.saveBtn)}</button>
      ${isEditing ? `<button type="button" class="btn btn-secondary btn-block" id="cancelEditBtn">${escapeHtml(l.cancelEditBtn)}</button>` : ""}`;
  const fieldsInOrder = isSheet
    ? [amountField, typeField, categoryField, accountField, transferSwapField, transferToField, dateField, noteField, commitPreviewField]
    : [typeField, dateField, categoryField, accountField, transferSwapField, transferToField, amountField, noteField];
  return `
    <form class="add-form" id="addForm" autocomplete="off">
      ${fieldsInOrder.join("")}
      ${bottomButtons}
    </form>
  `;
}
// handlers: { onSaved(), onCancelled() } -- called after a successful
// submit / the cancel-edit button, respectively. Neither handler is
// responsible for resetForm() itself; each caller's own callback decides
// when to reset (both current callers do it immediately). Call once
// after addFormFieldsHtml()'s markup is in the DOM.
// Toggles Category vs. Transfer-To visibility and the account field's
// label to match the currently selected type tab -- called once at wire
// time (to match whatever addFormFieldsHtml already rendered) and again on
// every type-tab change, without a full form re-render (which would blow
// away the amount/note fields' values and focus, same reasoning as
// renderCategoryChips staying standalone).
function updateFormTypeVisibility() {
  const l = L();
  const isTransfer = state.formType === "transfer";
  $("categoryField").classList.toggle("form-field-hidden", isTransfer);
  // Real bug found live: no category has type "transfer", so
  // renderFormCategoryOptions() always leaves #txCategory with zero
  // <option>s on this tab. Chrome does NOT exclude a required select from
  // constraint validation just because an ancestor is display:none, so a
  // required-but-optionless #txCategory silently blocked the native
  // "submit" event on every Transfer save -- the click never even reached
  // this file's own submit handler, hence zero console output and no
  // visible error (the validation bubble can't anchor to a hidden field).
  $("txCategory").required = !isTransfer;
  $("accountFieldLabel").textContent = isTransfer ? l.transferFromLabel : l.accountLabel;
  $("transferSwapRow").classList.toggle("form-field-hidden", !isTransfer);
  $("transferToField").classList.toggle("form-field-hidden", !isTransfer);
}
// Real bug found live while testing docs/specs/csv-import.md's account
// picker reuse (unrelated to that spec itself): this used to call
// renderTransferAccountChips() unconditionally, regardless of which type
// tab was active. renderTransferAccountChips() always excludes
// state.formToAccountId -- which resetForm()/editTx() set to a real
// account id (defaultToAccountId) whether or not Transfer is the active
// tab -- so with exactly 2 accounts, the plain Expense/Income picker could
// permanently show the *other* account disabled, with no tab switch ever
// correcting it (the type-radio handler below never re-rendered the
// account chips at all before this fix). Conditioning on state.formType
// here AND re-running it on every type switch fixes both the wrong
// initial render and the missing re-render on switching tabs.
function renderAccountFieldChips() {
  if (state.formType === "transfer") renderTransferAccountChips();
  else renderAccountChips();
}
function wireAddForm({ onSaved, onCancelled }) {
  const isEditing = !!state.editingId;
  renderFormCategoryOptions($("txCategory"));
  renderFormAccountOptions($("txAccount"));
  renderFormTransferToOptions($("txTransferTo"));
  renderCategoryChips();
  renderAccountFieldChips();
  updateFormTypeVisibility();
  if (isEditing) {
    const tx = transactions.find((t) => t.id === state.editingId);
    if (tx) { $("txAmount").value = tx.amount; $("txNote").value = tx.note || ""; }
  }
  // The calls above already trigger renderCommitPreview() as a side effect
  // (see renderCategoryChips()), but that ran before #txAmount/#txNote were
  // populated for an edit -- one explicit call here catches up.
  renderCommitPreview();
  document.querySelectorAll('input[name="form-type"]').forEach((r) => r.addEventListener("change", (e) => {
    state.formType = e.target.value;
    const guess = state.categoryManual ? state.formCategoryId : guessCategory($("txNote").value, state.formType);
    const opts = categories.filter((c) => c.type === state.formType);
    const guessValid = guess && opts.some((c) => c.id === guess);
    state.formCategoryId = guessValid ? guess : (opts[0] || {}).id || null;
    renderFormCategoryOptions($("txCategory"));
    renderCategoryChips();
    renderAccountFieldChips();
    updateFormTypeVisibility();
  }));
  $("txCategory").addEventListener("change", (e) => { state.formCategoryId = e.target.value; state.categoryManual = true; renderCategoryChips(); });
  $("txAccount").addEventListener("change", (e) => { state.formAccountId = e.target.value; renderCommitPreview(); });
  $("txTransferTo").addEventListener("change", (e) => { state.formToAccountId = e.target.value; renderCommitPreview(); });
  // Bug report: with exactly 2 accounts, the From/To chip pickers' own
  // same-account exclusion (docs/specs earlier pass) made reversing a
  // transfer's direction literally impossible -- whichever account isn't
  // currently picked on one side is, with only 2 accounts total, always
  // the other side's current value, so it's always the disabled option in
  // both pickers at once. A dedicated swap control sidesteps the picker
  // entirely by exchanging both state fields directly, rather than trying
  // to special-case the exclusion logic for the 2-account case.
  $("transferSwapBtn").addEventListener("click", () => {
    const from = state.formAccountId, to = state.formToAccountId;
    state.formAccountId = to;
    state.formToAccountId = from;
    $("txAccount").value = state.formAccountId;
    $("txTransferTo").value = state.formToAccountId;
    renderTransferAccountChips();
    renderCommitPreview();
  });
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
    renderCommitPreview();
  });
  $("txNote").addEventListener("input", function () {
    if (state.categoryManual) return;
    const guess = guessCategory(this.value, state.formType);
    if (guess) { state.formCategoryId = guess; $("txCategory").value = guess; renderCategoryChips(); }
  });
  // Nullish-safe: the sheet variant (opts.hideBottomButtons) never renders
  // #cancelEditBtn at all -- its Cancel action lives in the sticky header
  // instead (see renderAddSheet()'s own #addSheetCancel wiring).
  if (isEditing) $("cancelEditBtn")?.addEventListener("click", onCancelled);
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
    const accountId = $("txAccount").value;
    let savedTx = null;
    // Stage 2 of docs/specs/account-transfers.md: a transfer has no
    // category (checkBudgetAlert is never called -- it was never
    // spending) and needs its own two-different-accounts validation the
    // expense/income path doesn't.
    if (state.formType === "transfer") {
      const toAccountId = $("txTransferTo").value;
      if (!accountId || !toAccountId || accountId === toAccountId) {
        showToast(L().toastInvalidTransferAccounts);
        return;
      }
      if (state.editingId) {
        const idx = transactions.findIndex((t) => t.id === state.editingId);
        if (idx >= 0) {
          transactions[idx] = Object.assign({}, transactions[idx], { type: "transfer", date, category: "", categoryId: null, accountId, toAccountId, amount, note, updatedAt: Date.now() });
          savedTx = transactions[idx];
        }
        showToast(L().toastEdited);
      } else {
        savedTx = { id: uid(), type: "transfer", date, category: "", categoryId: null, accountId, toAccountId, amount, note, updatedAt: Date.now() };
        transactions.push(savedTx);
        showToast(L().toastAdded);
      }
      saveToStorage();
      onSaved();
      if (savedTx) pushTx(savedTx).then(() => syncNow());
      return;
    }
    const categoryId = $("txCategory").value;
    const category = categoryDisplayName(categories, categoryId, "");
    if (state.editingId) {
      const idx = transactions.findIndex((t) => t.id === state.editingId);
      if (idx >= 0) {
        transactions[idx] = Object.assign({}, transactions[idx], { type: state.formType, date, category, categoryId, accountId, toAccountId: null, amount, note, updatedAt: Date.now() });
        savedTx = transactions[idx];
      }
      showToast(L().toastEdited);
    } else {
      savedTx = { id: uid(), type: state.formType, date, category, categoryId, accountId, amount, note, updatedAt: Date.now() };
      transactions.push(savedTx);
      showToast(checkBudgetAlert(savedTx) || L().toastAdded);
    }
    saveToStorage();
    onSaved();
    if (savedTx) pushTx(savedTx).then(() => syncNow());
  });
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
  // Save/Cancel live in the header, not just at the end of the form: on a
  // real phone with the keypad up (entering the amount), the bottom of a
  // tall form can sit behind the keyboard entirely, making a bottom-only
  // Save button unreachable without dismissing the keypad first. The header
  // is `position: sticky` (styles.css) so both stay visible while scrolling
  // the form, mirroring the Cancel/Save pattern from Apple's own Sheets HIG.
  // Save is a plain `form="addForm"` button, not a JS click handler -- it
  // triggers the exact same native submit (and thus the exact same
  // validation/submit-handler code path in wireAddForm below) as pressing
  // Enter in a field would, so there's no second copy of the save logic to
  // keep in sync.
  container.innerHTML = `
    <div class="filter-sheet-backdrop" id="addSheetBackdrop" ${state.addSheetOpen ? "" : "hidden"}>
      <div class="filter-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(isEditing ? l.editTitle : l.addTitle)}">
        <div class="filter-sheet-header">
          ${sheetGrabberHtml()}
          <button type="button" class="sheet-header-btn" id="addSheetCancel">${escapeHtml(l.cancelBtn)}</button>
          <h3 class="sheet-title-center">${escapeHtml(isEditing ? l.editTitle : l.addTitle)}</h3>
          <button type="submit" form="addForm" class="sheet-header-btn sheet-header-btn-primary" id="addSheetSaveTop">${escapeHtml(l.saveShortBtn)}</button>
        </div>
        ${addFormFieldsHtml(l, isEditing, { hideBottomButtons: true })}
      </div>
    </div>
  `;
  // Backdrop tap, the header's Cancel button, a swipe-down on the grabber,
  // and Escape (below) all converge on this same silent-discard dismissal --
  // matching the Filters sheet, there's no "unsaved changes" confirmation.
  const dismiss = () => { resetForm(); closeAddSheet(); };
  $("addSheetCancel").addEventListener("click", dismiss);
  const backdrop = $("addSheetBackdrop");
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) dismiss(); });
  wireSheetDrag(backdrop.querySelector(".sheet-grabber"), backdrop.querySelector(".filter-sheet"), dismiss);
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
function closeAddSheet() {
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
