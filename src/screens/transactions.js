import { L } from "../i18n.js";
import { state, transactions } from "../state.js";
import { $, escapeHtml, optionsHtml, refreshIcons } from "../utils.js";
import { CATEGORIES } from "../categories.js";
import { byRecency, availableYears } from "../derived.js";
import { groupedTxRowsHtml, wireTxRowActions } from "./tx-row.js";
import { periodPickerHtml, wirePeriodPicker } from "./period-picker.js";

function defaultMonthNum() { return new Date().toISOString().slice(5, 7); }
function defaultYear() { return String(new Date().getFullYear()); }
function renderTxPeriodPicker() {
  const monthNum = state.txFilterMonthNum === "all" ? defaultMonthNum() : state.txFilterMonthNum;
  const year = state.txFilterYear === "all" ? defaultYear() : state.txFilterYear;
  $("txPeriodPickerRow").innerHTML = periodPickerHtml("tx", ["all", "month", "year"], state.txPeriodMode, monthNum, year);
  wirePeriodPicker("tx", {
    onMode: (m) => {
      state.txPeriodMode = m;
      if (m === "all") { state.txFilterMonthNum = "all"; state.txFilterYear = "all"; }
      else if (m === "year") { state.txFilterMonthNum = "all"; if (state.txFilterYear === "all") state.txFilterYear = defaultYear(); }
      else { if (state.txFilterMonthNum === "all") state.txFilterMonthNum = defaultMonthNum(); if (state.txFilterYear === "all") state.txFilterYear = defaultYear(); }
      renderTxPeriodPicker();
      renderTxListOnly();
    },
    onValue: (v) => {
      if (state.txPeriodMode === "month") { const [y, m] = v.split("-"); state.txFilterYear = y; state.txFilterMonthNum = m; }
      else { state.txFilterYear = v; }
      renderTxPeriodPicker();
      renderTxListOnly();
    }
  });
}

export function filteredTxList() {
  let rows = transactions.slice();
  if (state.txFilterType !== "all") rows = rows.filter((t) => t.type === state.txFilterType);
  if (state.txFilterMonthNum !== "all") rows = rows.filter((t) => t.date.slice(5, 7) === state.txFilterMonthNum);
  if (state.txFilterYear !== "all") rows = rows.filter((t) => t.date.slice(0, 4) === state.txFilterYear);
  if (state.txFilterCategory !== "all") rows = rows.filter((t) => t.category === state.txFilterCategory);
  const q = state.txSearch.trim().toLowerCase();
  if (q) rows = rows.filter((t) => (t.note || "").toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  return rows.sort(byRecency);
}
export function renderTxListOnly() {
  const l = L();
  const rows = filteredTxList();
  const html = rows.length
    ? groupedTxRowsHtml(rows)
    : `<div class="empty-note">${escapeHtml(l.noResults)}</div>`;
  $("txListContainer").innerHTML = html;
  wireTxRowActions();
  refreshIcons();
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
  const allCats = CATEGORIES.income.concat(CATEGORIES.expense);
  $("screen").innerHTML = `
    <h2 class="screen-title">${escapeHtml(l.allTransactions)}</h2>
    <div class="tabs block" role="radiogroup" style="margin-bottom:12px">
      <label class="tab-opt"><input type="radio" name="tx-type-filter" value="all" ${state.txFilterType === "all" ? "checked" : ""}>${escapeHtml(l.filterAll)}</label>
      <label class="tab-opt"><input type="radio" name="tx-type-filter" value="income" ${state.txFilterType === "income" ? "checked" : ""}>${escapeHtml(l.incomeLabel)}</label>
      <label class="tab-opt"><input type="radio" name="tx-type-filter" value="expense" ${state.txFilterType === "expense" ? "checked" : ""}>${escapeHtml(l.expenseLabel)}</label>
    </div>
    <div class="filter-row" id="txPeriodPickerRow"></div>
    <div class="filter-row">
      <select class="input" id="txFilterCategory">
        <option value="all">${escapeHtml(l.allCategories)}</option>
        ${optionsHtml(allCats, state.txFilterCategory)}
      </select>
    </div>
    <input class="input" style="margin-bottom:12px" id="txSearchInput" placeholder="${escapeHtml(l.searchPlaceholder)}" value="${escapeHtml(state.txSearch)}">
    <div class="list-card" id="txListContainer"></div>
  `;
  renderTxPeriodPicker();
  renderTxListOnly();
  document.querySelectorAll('input[name="tx-type-filter"]').forEach((r) => r.addEventListener("change", (e) => { state.txFilterType = e.target.value; renderTxListOnly(); }));
  $("txFilterCategory").addEventListener("change", (e) => { state.txFilterCategory = e.target.value; renderTxListOnly(); });
  $("txSearchInput").addEventListener("input", (e) => { state.txSearch = e.target.value; renderTxListOnly(); });
  refreshIcons();
}
