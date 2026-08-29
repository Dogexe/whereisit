import { L } from "../i18n.js";
import { state, categories } from "../state.js";
import { $, escapeHtml, refreshIcons, icon, fmtMoney, monthLabel, dateLabel } from "../utils.js";
import { categoryDisplayName } from "../categories.js";
import { availableYears, yearLabel, filteredTxList } from "../derived.js";
import { groupedTxRowsHtml, wireTxRowActions } from "./tx-row.js";
import { periodPickerHtml, wirePeriodPicker } from "./period-picker.js";

function defaultMonthNum() { return new Date().toISOString().slice(5, 7); }
function defaultYear() { return String(new Date().getFullYear()); }
function todayIso() { return new Date().toISOString().slice(0, 10); }
// Type and date (period-picker) now live inside the Filters sheet, not
// permanently visible -- only Search + the Filters button sit in the
// always-visible toolbar row. Both still update chips/badge/list via
// refreshFilteredResults() exactly like every other in-sheet facet.
function renderTxPeriodPicker() {
  const monthNum = state.txFilterMonthNum === "all" ? defaultMonthNum() : state.txFilterMonthNum;
  const year = state.txFilterYear === "all" ? defaultYear() : state.txFilterYear;
  $("txPeriodPickerRow").innerHTML = periodPickerHtml("tx", ["all", "today", "month", "year", "custom"], state.txPeriodMode, monthNum, year, state.txFilterDateFrom, state.txFilterDateTo);
  wirePeriodPicker("tx", {
    onMode: (m) => {
      state.txPeriodMode = m;
      if (m === "all" || m === "today") { state.txFilterMonthNum = "all"; state.txFilterYear = "all"; }
      else if (m === "year") { state.txFilterMonthNum = "all"; if (state.txFilterYear === "all") state.txFilterYear = defaultYear(); }
      else if (m === "month") { if (state.txFilterMonthNum === "all") state.txFilterMonthNum = defaultMonthNum(); if (state.txFilterYear === "all") state.txFilterYear = defaultYear(); }
      else if (m === "custom") { if (!state.txFilterDateFrom) state.txFilterDateFrom = todayIso(); if (!state.txFilterDateTo) state.txFilterDateTo = todayIso(); }
      renderTxPeriodPicker();
      refreshFilteredResults();
    },
    onValue: (v) => {
      if (state.txPeriodMode === "month") { const [y, m] = v.split("-"); state.txFilterYear = y; state.txFilterMonthNum = m; }
      else { state.txFilterYear = v; }
      renderTxPeriodPicker();
      refreshFilteredResults();
    },
    onRange: (from, to) => { state.txFilterDateFrom = from; state.txFilterDateTo = to; refreshFilteredResults(); }
  });
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
  state.txFilterType = "all"; state.txFilterCategory = new Set(); state.txSearch = "";
  state.txFilterAmountMin = null; state.txFilterAmountMax = null;
  resetPeriod();
  renderTransactions();
}
function activeFacetCount() {
  return (state.txFilterType !== "all" ? 1 : 0) + (state.txPeriodMode !== "all" ? 1 : 0) +
    state.txFilterCategory.size + (state.txFilterAmountMin != null || state.txFilterAmountMax != null ? 1 : 0);
}
function updateFiltersBtnBadge() {
  const badge = document.getElementById("txFiltersBadge");
  if (!badge) return;
  const n = activeFacetCount();
  badge.hidden = n === 0;
  badge.textContent = String(n);
}
function renderActiveFilterChips() {
  const l = L();
  const container = document.getElementById("txActiveChips");
  if (!container) return;
  const chips = [];
  if (state.txFilterType !== "all") chips.push({ key: "type", label: `${l.filterChipType}: ${state.txFilterType === "income" ? l.incomeLabel : l.expenseLabel}` });
  if (state.txPeriodMode !== "all") chips.push({ key: "period", label: `${l.filterChipDate}: ${periodChipLabel()}` });
  state.txFilterCategory.forEach((id) => chips.push({ key: "cat:" + id, label: `${l.filterChipCategory}: ${categoryDisplayName(categories, id, id)}` }));
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
  renderTransactions();
}
function refreshFilteredResults() {
  renderActiveFilterChips();
  updateFiltersBtnBadge();
  renderTxListOnly();
}
export function renderTxListOnly() {
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
  return `
    <div class="filter-sheet-backdrop" id="txFilterSheetBackdrop" ${state.txFilterSheetOpen ? "" : "hidden"}>
      <div class="filter-sheet" role="dialog" aria-label="${escapeHtml(l.filtersBtn)}">
        <div class="filter-sheet-header">
          <h3>${escapeHtml(l.filtersBtn)}</h3>
          <button type="button" class="filter-sheet-close-btn" id="txFilterSheetClose" aria-label="${escapeHtml(l.closeAria)}">&times;</button>
        </div>
        <div class="field">
          <label>${escapeHtml(l.typeLabel)}</label>
          <div class="tabs block" role="radiogroup">
            <label class="tab-opt"><input type="radio" name="tx-type-filter" value="all" ${state.txFilterType === "all" ? "checked" : ""}>${escapeHtml(l.filterAll)}</label>
            <label class="tab-opt"><input type="radio" name="tx-type-filter" value="income" ${state.txFilterType === "income" ? "checked" : ""}>${escapeHtml(l.incomeLabel)}</label>
            <label class="tab-opt"><input type="radio" name="tx-type-filter" value="expense" ${state.txFilterType === "expense" ? "checked" : ""}>${escapeHtml(l.expenseLabel)}</label>
          </div>
        </div>
        <div class="field">
          <label>${escapeHtml(l.dateLabel)}</label>
          <div class="filter-row" id="txPeriodPickerRow" style="margin-bottom:0"></div>
        </div>
        <div class="field">
          <label>${escapeHtml(l.categoryLabel)}</label>
          <div class="filter-checkbox-list">${checkboxRows}</div>
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
}
// Registered once at module load, not per-render -- renderTransactions()
// runs on every navigation to this tab (and on sync-triggered re-renders),
// and a per-render document-level listener would pile up indefinitely
// since nothing ever removes it.
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.txFilterSheetOpen) closeTxFilterSheet(); });
function wireFilterSheet() {
  const backdrop = document.getElementById("txFilterSheetBackdrop");
  const openBtn = document.getElementById("openTxFiltersBtn");
  const closeBtn = document.getElementById("txFilterSheetClose");
  openBtn.addEventListener("click", () => { state.txFilterSheetOpen = true; backdrop.hidden = false; });
  closeBtn.addEventListener("click", closeTxFilterSheet);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeTxFilterSheet(); });
  document.querySelectorAll('input[name="tx-type-filter"]').forEach((r) => r.addEventListener("change", (e) => { state.txFilterType = e.target.value; refreshFilteredResults(); }));
  document.querySelectorAll("[data-filter-cat]").forEach((cb) => cb.addEventListener("change", () => {
    const id = cb.getAttribute("data-filter-cat");
    if (cb.checked) state.txFilterCategory.add(id); else state.txFilterCategory.delete(id);
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
        <span>${escapeHtml(l.filtersBtn)}</span><span class="filter-badge" id="txFiltersBadge" hidden></span>
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
  wireFilterSheet();
  $("txSearchInput").addEventListener("input", (e) => { state.txSearch = e.target.value; renderTxListOnly(); });
  refreshIcons();
}
