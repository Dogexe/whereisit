import { L } from "../i18n.js";
import { state, categories, accounts } from "../state.js";
import { $, escapeHtml, refreshIcons, icon, fmtMoney, monthLabel, dateLabel, createFocusTrap, localDateIso, localMonthKey, sheetGrabberHtml, wireSheetDrag } from "../utils.js";
import { categoryDisplayName } from "../categories.js";
import { accountNameById } from "../accounts.js";
import { availableYears, yearLabel, filteredTxList } from "../derived.js";
import { groupedTxRowsHtml, wireTxRowActions } from "./tx-row.js";
import { pillPickerHtml, wirePillPicker } from "./period-picker.js";

function defaultMonthNum() { return localMonthKey().slice(5, 7); }
function defaultYear() { return String(new Date().getFullYear()); }
function todayIso() { return localDateIso(); }
// Type and date now live inside the Filters sheet, not permanently
// visible -- only Search + the Filters button sit in the always-visible
// toolbar row. Date itself is two independently-rerendered pieces, both
// driven by the same txPeriodMode/txFilterMonthNum/txFilterYear/
// txFilterDateFrom/txFilterDateTo state (docs/specs/
// transactions-period-picker-unification.md): the pill (renderTxPeriodPicker,
// reusing Insights' shared pillPickerHtml/wirePillPicker -- "All time" and
// "Today" as its two popover shortcuts, since Transactions is the first
// pill caller that needs more than Insights' single "Today") and the
// custom single-day/range section (renderTxCustomDateField, styled
// identically to Insights' own Filters-sheet custom-date section). Each
// re-renders the other after any change, since a pill action can clear
// an active custom date's relevance (well, the reverse: picking a real
// month/year leaves txPeriodMode no longer "custom", so the custom
// field's own "Clear" button should stop showing) and a custom-date
// commit hides the pill entirely, mirroring Insights' "why the picker
// disappears" rule -- two controls can't both claim to represent the
// active period without one of them lying.
function renderTxPeriodPicker() {
  const row = $("txPeriodPickerRow");
  if (!row) return;
  if (state.txPeriodMode === "custom") { row.innerHTML = ""; return; }
  const l = L();
  const monthNum = state.txFilterMonthNum === "all" ? defaultMonthNum() : state.txFilterMonthNum;
  const year = state.txFilterYear === "all" ? defaultYear() : state.txFilterYear;
  const pillMode = state.txPeriodMode === "year" ? "year" : "month";
  const activeShortcut = state.txPeriodMode === "all" || state.txPeriodMode === "today" ? state.txPeriodMode : null;
  row.innerHTML = pillPickerHtml("tx", pillMode, monthNum, year, state.txPillPopoverOpen, activeShortcut, {
    shortcuts: [{ key: "all", label: l.filterAll }, { key: "today", label: l.periodTodayLabel }]
  });
  wirePillPicker("tx", {
    onStep: (dir) => {
      const wasYear = state.txPeriodMode === "year";
      let m = Number(monthNum), y = Number(year);
      if (wasYear) { y += dir; } else { m += dir; if (m > 12) { m = 1; y++; } else if (m < 1) { m = 12; y--; } }
      state.txFilterMonthNum = String(m).padStart(2, "0"); state.txFilterYear = String(y);
      state.txPeriodMode = wasYear ? "year" : "month";
      renderTxPeriodPicker(); refreshFilteredResults();
    },
    onToggleOpen: () => { state.txPillPopoverOpen = !state.txPillPopoverOpen; renderTxPeriodPicker(); },
    onYearStep: (dir) => {
      const wasYear = state.txPeriodMode === "year";
      state.txFilterYear = String(Number(year) + dir); state.txFilterMonthNum = monthNum;
      state.txPeriodMode = wasYear ? "year" : "month";
      renderTxPeriodPicker();
    },
    onPickWholeYear: () => { state.txFilterYear = year; state.txPeriodMode = "year"; state.txPillPopoverOpen = false; renderTxPeriodPicker(); refreshFilteredResults(); },
    onPickMonth: (mm) => { state.txFilterMonthNum = mm; state.txFilterYear = year; state.txPeriodMode = "month"; state.txPillPopoverOpen = false; renderTxPeriodPicker(); refreshFilteredResults(); },
    onPickShortcut: (key) => {
      state.txPeriodMode = key;
      if (key === "all" || key === "today") { state.txFilterMonthNum = "all"; state.txFilterYear = "all"; }
      state.txPillPopoverOpen = false;
      renderTxPeriodPicker(); refreshFilteredResults();
    },
    onClose: () => { state.txPillPopoverOpen = false; renderTxPeriodPicker(); }
  });
  refreshIcons();
}
// Custom date: single day / date range toggle, identical shape and i18n
// strings to Insights' own Filters-sheet section (no new strings needed).
// Picking "single day" writes the same value to both txFilterDateFrom/To
// (state.txFilterDateFrom === state.txFilterDateTo), the same trick
// Insights uses so filteredTxList() needed no new code path. Committing
// either kind sets txPeriodMode = "custom" explicitly -- unlike Insights
// (which has no "custom" mode at all, just an independent
// hasCustomRange() check), Transactions' period is one single enum this
// was always a member of, so entering a custom date is a mode change
// like any other.
function renderTxCustomDateField() {
  const field = $("txCustomDateField");
  if (!field) return;
  const l = L();
  const kind = state.txCustomKind;
  const isActive = state.txPeriodMode === "custom";
  field.innerHTML = `
    <div class="filter-field-label"><span>${escapeHtml(l.customDateLabel)}</span>${isActive ? `<button type="button" id="txClearCustomBtn">${escapeHtml(l.clearBtn)}</button>` : ""}</div>
    <div class="kind-toggle">
      <button type="button" class="${kind === "single" ? "active" : ""}" data-tx-custom-kind="single">${escapeHtml(l.singleDayLabel)}</button>
      <button type="button" class="${kind === "range" ? "active" : ""}" data-tx-custom-kind="range">${escapeHtml(l.dateRangeLabel)}</button>
    </div>
    ${kind === "single" ? `
      <div class="input-wrap">${icon("calendar", 'style="color:var(--color-accent)"')}<input type="date" id="txSingleDate" value="${isActive && state.txFilterDateFrom === state.txFilterDateTo ? escapeHtml(state.txFilterDateFrom) : ""}"></div>
      <div class="field-hint">${escapeHtml(l.singleDayHint)}</div>
    ` : `
      <div class="amount-range-row">
        <input type="date" class="input" aria-label="${escapeHtml(l.dateFromLabel)}" id="txRangeFrom" value="${isActive ? escapeHtml(state.txFilterDateFrom) : ""}">
        <span>–</span>
        <input type="date" class="input" aria-label="${escapeHtml(l.dateToLabel)}" id="txRangeTo" value="${isActive ? escapeHtml(state.txFilterDateTo) : ""}">
      </div>
      <div class="field-hint">${escapeHtml(l.dateRangeHint)}</div>
    `}
  `;
  document.querySelectorAll("[data-tx-custom-kind]").forEach((b) => b.addEventListener("click", () => {
    state.txCustomKind = b.getAttribute("data-tx-custom-kind");
    renderTxCustomDateField();
  }));
  const clearBtn = document.getElementById("txClearCustomBtn");
  if (clearBtn) clearBtn.addEventListener("click", () => { resetPeriod(); renderTxCustomDateField(); renderTxPeriodPicker(); refreshFilteredResults(); });
  const singleInput = document.getElementById("txSingleDate");
  if (singleInput) singleInput.addEventListener("change", () => {
    if (!singleInput.value) return;
    state.txFilterDateFrom = singleInput.value; state.txFilterDateTo = singleInput.value; state.txPeriodMode = "custom";
    renderTxCustomDateField(); renderTxPeriodPicker(); refreshFilteredResults();
  });
  const fromInput = document.getElementById("txRangeFrom");
  const toInput = document.getElementById("txRangeTo");
  if (fromInput && toInput) {
    const apply = () => {
      let from = fromInput.value, to = toInput.value;
      if (!from || !to) return;
      if (from > to) { const t = from; from = to; to = t; }
      state.txFilterDateFrom = from; state.txFilterDateTo = to; state.txPeriodMode = "custom";
      renderTxCustomDateField(); renderTxPeriodPicker(); refreshFilteredResults();
    };
    fromInput.addEventListener("change", apply);
    toInput.addEventListener("change", apply);
  }
}
function resetPeriod() {
  state.txPeriodMode = "all"; state.txFilterMonthNum = "all"; state.txFilterYear = "all";
  state.txFilterDateFrom = ""; state.txFilterDateTo = "";
}
function periodChipLabel() {
  if (state.txPeriodMode === "today") return L().periodTodayLabel;
  if (state.txPeriodMode === "month") {
    const monthNum = state.txFilterMonthNum === "all" ? defaultMonthNum() : state.txFilterMonthNum;
    const year = state.txFilterYear === "all" ? defaultYear() : state.txFilterYear;
    return monthLabel(year + "-" + monthNum);
  }
  if (state.txPeriodMode === "year") return String(yearLabel(state.txFilterYear === "all" ? defaultYear() : state.txFilterYear));
  if (state.txPeriodMode === "custom") {
    if (state.txCustomKind === "single" || state.txFilterDateFrom === state.txFilterDateTo) {
      return state.txFilterDateFrom ? dateLabel(state.txFilterDateFrom) : "";
    }
    const from = state.txFilterDateFrom ? dateLabel(state.txFilterDateFrom) : "";
    const to = state.txFilterDateTo ? dateLabel(state.txFilterDateTo) : "";
    return `${from} – ${to}`;
  }
  return "";
}

// Resets every active filter/search field back to its default, then does a
// full re-render so every control (search, type, date, category, amount --
// and the sheet, if it happens to be open) reflects the reset state too.
function clearTxFilters() {
  state.txFilterType = "all"; state.txFilterCategory = new Set(); state.txFilterAccount = new Set(); state.txSearch = "";
  state.txFilterAmountMin = null; state.txFilterAmountMax = null;
  resetPeriod();
  renderTransactions();
}
function activeFacetCount() {
  return (state.txFilterType !== "all" ? 1 : 0) + (state.txPeriodMode !== "all" ? 1 : 0) +
    state.txFilterCategory.size + state.txFilterAccount.size + (state.txFilterAmountMin != null || state.txFilterAmountMax != null ? 1 : 0);
}
function updateFiltersBtnBadge() {
  const badge = document.getElementById("txFiltersBadge");
  if (!badge) return;
  const n = activeFacetCount();
  badge.hidden = n === 0;
  badge.textContent = String(n);
}
function typeFilterLabel(type, l) {
  if (type === "income") return l.incomeLabel;
  if (type === "transfer") return l.transferLabel;
  return l.expenseLabel;
}
function renderActiveFilterChips() {
  const l = L();
  const container = document.getElementById("txActiveChips");
  if (!container) return;
  const chips = [];
  // Stage 4 of docs/specs/account-transfers.md: this used to assume any
  // non-"income" type meant "expense" -- correct back when those were the
  // only two options, but silently wrong the moment "transfer" became a
  // third. typeFilterLabel() below maps all three explicitly.
  if (state.txFilterType !== "all") chips.push({ key: "type", label: `${l.filterChipType}: ${typeFilterLabel(state.txFilterType, l)}` });
  if (state.txPeriodMode !== "all") chips.push({ key: "period", label: `${l.filterChipDate}: ${periodChipLabel()}` });
  state.txFilterCategory.forEach((id) => chips.push({ key: "cat:" + id, label: `${l.filterChipCategory}: ${categoryDisplayName(categories, id, id)}` }));
  state.txFilterAccount.forEach((id) => chips.push({ key: "acc:" + id, label: `${l.filterChipAccount}: ${accountNameById(accounts, id, id)}` }));
  if (state.txFilterAmountMin != null || state.txFilterAmountMax != null) {
    const min = state.txFilterAmountMin != null ? fmtMoney(state.txFilterAmountMin) : "";
    const max = state.txFilterAmountMax != null ? fmtMoney(state.txFilterAmountMax) : "";
    chips.push({ key: "amount", label: `${l.filterChipAmount}: ${min}–${max}` });
  }
  container.innerHTML = chips.map((c) => `<button type="button" class="filter-chip" data-remove-filter="${c.key}">${escapeHtml(c.label)} ×</button>`).join("");
  container.querySelectorAll("[data-remove-filter]").forEach((btn) => btn.addEventListener("click", () => removeFilterChip(btn.getAttribute("data-remove-filter"))));
}
// Chips only ever render while the sheet is closed (its backdrop covers
// the whole screen when open), so a full re-render here is safe -- no
// in-sheet typing/focus state to preserve, unlike refreshFilteredResults().
function removeFilterChip(key) {
  if (key === "type") state.txFilterType = "all";
  else if (key === "period") resetPeriod();
  else if (key === "amount") { state.txFilterAmountMin = null; state.txFilterAmountMax = null; }
  else if (key.startsWith("cat:")) state.txFilterCategory.delete(key.slice(4));
  else if (key.startsWith("acc:")) state.txFilterAccount.delete(key.slice(4));
  renderTransactions();
}
function refreshFilteredResults() {
  renderActiveFilterChips();
  updateFiltersBtnBadge();
  renderTxListOnly();
}
function renderTxListOnly() {
  const l = L();
  const rows = filteredTxList();
  const html = rows.length
    ? groupedTxRowsHtml(rows)
    : `<div class="empty-note empty-note-search">${icon("search")}<div>${escapeHtml(l.noResults)}</div><button type="button" class="btn btn-ghost" id="clearTxFiltersBtn">${escapeHtml(l.clearFiltersBtn)}</button></div>`;
  $("txListContainer").innerHTML = html;
  wireTxRowActions();
  const clearBtn = document.getElementById("clearTxFiltersBtn");
  if (clearBtn) clearBtn.addEventListener("click", clearTxFilters);
  refreshIcons();
}
function filterSheetHtml() {
  const l = L();
  const checkboxRows = categories.filter((c) => !c.deleted).map((c) => `
    <label class="filter-checkbox-row">
      <input type="checkbox" data-filter-cat="${c.id}" ${state.txFilterCategory.has(c.id) ? "checked" : ""}>
      <span>${escapeHtml(c.name)}</span>
    </label>`).join("");
  // Stage 6 of docs/specs/multi-account-support.md. Deliberately includes
  // archived accounts (unlike the category list's !c.deleted filter above)
  // -- decision 8 keeps an archived account's history findable, so it must
  // stay filterable here too.
  const accountCheckboxRows = accounts.map((a) => `
    <label class="filter-checkbox-row">
      <input type="checkbox" data-filter-account="${a.id}" ${state.txFilterAccount.has(a.id) ? "checked" : ""}>
      <span>${escapeHtml(a.name)}</span>
    </label>`).join("");
  return `
    <div class="filter-sheet-backdrop" id="txFilterSheetBackdrop" ${state.txFilterSheetOpen ? "" : "hidden"}>
      <div class="filter-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(l.filtersBtn)}">
        <div class="filter-sheet-header">
          ${sheetGrabberHtml()}
          <h3>${escapeHtml(l.filtersBtn)}</h3>
          <button type="button" class="filter-sheet-close-btn" id="txFilterSheetClose" aria-label="${escapeHtml(l.closeAria)}">&times;</button>
        </div>
        <div class="field">
          <label>${escapeHtml(l.typeLabel)}</label>
          <div class="tabs block" role="radiogroup">
            <label class="tab-opt"><input type="radio" name="tx-type-filter" value="all" ${state.txFilterType === "all" ? "checked" : ""}>${escapeHtml(l.filterAll)}</label>
            <label class="tab-opt"><input type="radio" name="tx-type-filter" value="income" ${state.txFilterType === "income" ? "checked" : ""}>${escapeHtml(l.incomeLabel)}</label>
            <label class="tab-opt"><input type="radio" name="tx-type-filter" value="expense" ${state.txFilterType === "expense" ? "checked" : ""}>${escapeHtml(l.expenseLabel)}</label>
            <label class="tab-opt"><input type="radio" name="tx-type-filter" value="transfer" ${state.txFilterType === "transfer" ? "checked" : ""}>${escapeHtml(l.transferLabel)}</label>
          </div>
        </div>
        <div class="field">
          <label>${escapeHtml(l.dateLabel)}</label>
          <div class="filter-row" id="txPeriodPickerRow" style="margin-bottom:0"></div>
        </div>
        <div class="field" id="txCustomDateField"></div>
        <div class="field">
          <label>${escapeHtml(l.categoryLabel)}</label>
          <div class="filter-checkbox-list">${checkboxRows}</div>
        </div>
        <div class="field">
          <label>${escapeHtml(l.accountLabel)}</label>
          <div class="filter-checkbox-list">${accountCheckboxRows}</div>
        </div>
        <div class="field">
          <label>${escapeHtml(l.amountLabel)}</label>
          <div class="amount-range-row">
            <input type="number" class="input" id="sheetAmountMin" placeholder="${escapeHtml(l.amountMinPlaceholder)}" value="${state.txFilterAmountMin ?? ""}">
            <span>–</span>
            <input type="number" class="input" id="sheetAmountMax" placeholder="${escapeHtml(l.amountMaxPlaceholder)}" value="${state.txFilterAmountMax ?? ""}">
          </div>
        </div>
      </div>
    </div>`;
}
// Looked up fresh from the DOM rather than closed over at wire-time, so the
// single module-level Escape listener below always finds the *current*
// backdrop element after a re-render, not a stale detached one.
function closeTxFilterSheet() {
  state.txFilterSheetOpen = false;
  const backdrop = document.getElementById("txFilterSheetBackdrop");
  if (backdrop) backdrop.hidden = true;
  txFilterFocusTrap.deactivate();
}
// Registered once at module load, not per-render -- renderTransactions()
// runs on every navigation to this tab (and on sync-triggered re-renders),
// and a per-render document-level listener would pile up indefinitely
// since nothing ever removes it. Same reasoning for the focus trap below.
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.txFilterSheetOpen) closeTxFilterSheet(); });
const txFilterFocusTrap = createFocusTrap(() => {
  const backdrop = document.getElementById("txFilterSheetBackdrop");
  return backdrop && !backdrop.hidden ? backdrop.querySelector(".filter-sheet") : null;
});
function wireFilterSheet() {
  const backdrop = document.getElementById("txFilterSheetBackdrop");
  const openBtn = document.getElementById("openTxFiltersBtn");
  const closeBtn = document.getElementById("txFilterSheetClose");
  openBtn.addEventListener("click", () => { state.txFilterSheetOpen = true; backdrop.hidden = false; txFilterFocusTrap.activate(); });
  closeBtn.addEventListener("click", closeTxFilterSheet);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeTxFilterSheet(); });
  wireSheetDrag(backdrop.querySelector(".sheet-grabber"), backdrop.querySelector(".filter-sheet"), closeTxFilterSheet);
  document.querySelectorAll('input[name="tx-type-filter"]').forEach((r) => r.addEventListener("change", (e) => { state.txFilterType = e.target.value; refreshFilteredResults(); }));
  document.querySelectorAll("[data-filter-cat]").forEach((cb) => cb.addEventListener("change", () => {
    const id = cb.getAttribute("data-filter-cat");
    if (cb.checked) state.txFilterCategory.add(id); else state.txFilterCategory.delete(id);
    refreshFilteredResults();
  }));
  document.querySelectorAll("[data-filter-account]").forEach((cb) => cb.addEventListener("change", () => {
    const id = cb.getAttribute("data-filter-account");
    if (cb.checked) state.txFilterAccount.add(id); else state.txFilterAccount.delete(id);
    refreshFilteredResults();
  }));
  $("sheetAmountMin").addEventListener("input", (e) => { state.txFilterAmountMin = e.target.value === "" ? null : parseFloat(e.target.value); refreshFilteredResults(); });
  $("sheetAmountMax").addEventListener("input", (e) => { state.txFilterAmountMax = e.target.value === "" ? null : parseFloat(e.target.value); refreshFilteredResults(); });
}
export function renderTransactions() {
  const l = L();
  const years = availableYears();
  // If the previously-picked year no longer has any data behind it (e.g.
  // its only transactions were deleted), fall back to "all" rather than
  // leaving the picker pointing at an option that no longer exists.
  if (state.txFilterYear !== "all" && !years.includes(state.txFilterYear)) {
    state.txFilterYear = "all"; state.txFilterMonthNum = "all"; state.txPeriodMode = "all";
  }
  $("screen").innerHTML = `
    <h2 class="screen-title">${escapeHtml(l.allTransactions)}</h2>
    <div class="tx-toolbar-row">
      <input class="input" id="txSearchInput" placeholder="${escapeHtml(l.searchPlaceholder)}" value="${escapeHtml(state.txSearch)}">
      <button type="button" class="btn btn-secondary filters-btn" id="openTxFiltersBtn">
        ${icon("filter")}<span>${escapeHtml(l.filtersBtn)}</span><span class="filter-badge" id="txFiltersBadge" hidden></span>
      </button>
    </div>
    <div class="active-filter-chips" id="txActiveChips"></div>
    <div class="list-card tx-list-card">
      <div class="tx-table-head" aria-hidden="true">
        <span>${escapeHtml(l.dateLabel)}</span>
        <span>${escapeHtml(l.categoryLabel)}</span>
        <span>${escapeHtml(l.amountLabel)}</span>
        <span></span>
      </div>
      <div id="txListContainer"></div>
    </div>
    ${filterSheetHtml()}
  `;
  renderTxListOnly();
  renderActiveFilterChips();
  updateFiltersBtnBadge();
  renderTxPeriodPicker();
  renderTxCustomDateField();
  wireFilterSheet();
  $("txSearchInput").addEventListener("input", (e) => { state.txSearch = e.target.value; renderTxListOnly(); });
  refreshIcons();
}
