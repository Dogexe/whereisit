import { L } from "../i18n.js";
import { state, categories } from "../state.js";
import { $, escapeHtml, fmtMoney, monthLabel, dateLabel, refreshIcons } from "../utils.js";
import { categoryDisplayName } from "../categories.js";
import {
  availableYears, yearLabel, computeBudgets, computeBudgetsForYear, computeBudgetsForRange,
  unbudgetedSpend, unbudgetedSpendForYear, unbudgetedSpendForRange,
  computeBreakdown, computeBreakdownForYear, computeBreakdownForRange, pieChartSvg, computeTrend
} from "../derived.js";
import { periodPickerHtml, wirePeriodPicker } from "./period-picker.js";
import { setTab } from "./router.js";

function todayIso() { return new Date().toISOString().slice(0, 10); }
// "today"/"custom" (docs/specs/transactions-filters-rework.md's Insights
// follow-up) only ever apply to Budgets/Breakdown -- Trend's own picker row
// is already hidden entirely (see renderInsights below) since computeTrend()
// doesn't read the period-picker at all, so there's nothing to generalize
// there.
function renderInsightsPeriodPicker() {
  $("insightsPeriodPickerRow").innerHTML = periodPickerHtml("insights", ["today", "month", "year", "custom"], state.insightsPeriodMode, state.insightsMonthNum, state.insightsYear, state.insightsFilterDateFrom, state.insightsFilterDateTo);
  wirePeriodPicker("insights", {
    onMode: (m) => {
      state.insightsPeriodMode = m;
      if (m === "custom") { if (!state.insightsFilterDateFrom) state.insightsFilterDateFrom = todayIso(); if (!state.insightsFilterDateTo) state.insightsFilterDateTo = todayIso(); }
      renderInsightsPeriodPicker();
      renderInsightsBody();
    },
    onValue: (v) => {
      if (state.insightsPeriodMode === "month") { const [y, m] = v.split("-"); state.insightsYear = y; state.insightsMonthNum = m; }
      else { state.insightsYear = v; }
      renderInsightsPeriodPicker();
      renderInsightsBody();
    },
    onRange: (from, to) => { state.insightsFilterDateFrom = from; state.insightsFilterDateTo = to; renderInsightsBody(); }
  });
}
function insightsRangeBounds() {
  if (state.insightsPeriodMode === "today") { const t = todayIso(); return [t, t]; }
  return [state.insightsFilterDateFrom || "", state.insightsFilterDateTo || ""];
}
function periodDisplayLabel() {
  if (state.insightsPeriodMode === "today") return L().periodTodayLabel;
  if (state.insightsPeriodMode === "custom") {
    const from = state.insightsFilterDateFrom ? dateLabel(state.insightsFilterDateFrom) : "";
    const to = state.insightsFilterDateTo ? dateLabel(state.insightsFilterDateTo) : "";
    return `${from} – ${to}`;
  }
  if (state.insightsPeriodMode === "year") return String(yearLabel(state.insightsYear));
  return monthLabel(state.insightsYear + "-" + state.insightsMonthNum);
}
export function renderInsights() {
  const l = L();
  const years = availableYears();
  // Insights always needs one concrete year (unlike Transactions, it has
  // no "all" option); fall back to the current year if the previously
  // picked one no longer has any data behind it.
  if (!years.includes(state.insightsYear)) state.insightsYear = String(new Date().getFullYear());
  $("screen").innerHTML = `
    <h2 class="screen-title" style="margin-bottom:12px">${escapeHtml(l.financialOverview)}</h2>
    <div class="tabs block" role="radiogroup" style="margin-bottom:14px">
      <label class="tab-opt"><input type="radio" name="insights-tab" value="budgets" ${state.insightsTab === "budgets" ? "checked" : ""}>${escapeHtml(l.budgetsTab)}</label>
      <label class="tab-opt"><input type="radio" name="insights-tab" value="breakdown" ${state.insightsTab === "breakdown" ? "checked" : ""}>${escapeHtml(l.categoryTab)}</label>
      <label class="tab-opt"><input type="radio" name="insights-tab" value="trend" ${state.insightsTab === "trend" ? "checked" : ""}>${escapeHtml(l.trendTab)}</label>
    </div>
    <div class="filter-row" id="insightsPeriodPickerRow" style="${state.insightsTab === "trend" ? "display:none" : ""};margin-bottom:18px"></div>
    <div id="insightsBody"></div>
  `;
  renderInsightsPeriodPicker();
  renderInsightsBody();
  document.querySelectorAll('input[name="insights-tab"]').forEach((r) => r.addEventListener("change", (e) => {
    state.insightsTab = e.target.value;
    $("insightsPeriodPickerRow").style.display = state.insightsTab === "trend" ? "none" : "";
    renderInsightsBody();
  }));
}
// docs/specs/transactions-filters-rework.md: same Filters-button + sheet +
// chip treatment as Transactions, but Breakdown-tab-only (see the spec's
// key decisions for why Budgets/Trend don't get this) and category-only --
// no search or amount facets, since Insights only ever shows pre-summed
// totals, never individual transaction rows.
function insightsFilterSheetHtml() {
  const l = L();
  const checkboxRows = categories.filter((c) => c.type === "expense" && !c.deleted).map((c) => `
    <label class="filter-checkbox-row">
      <input type="checkbox" data-insights-filter-cat="${c.id}" ${state.insightsFilterCategory.has(c.id) ? "checked" : ""}>
      <span>${escapeHtml(c.name)}</span>
    </label>`).join("");
  return `
    <div class="filter-sheet-backdrop" id="insightsFilterSheetBackdrop" ${state.insightsFilterSheetOpen ? "" : "hidden"}>
      <div class="filter-sheet" role="dialog" aria-label="${escapeHtml(l.filtersBtn)}">
        <div class="filter-sheet-header">
          <h3>${escapeHtml(l.filtersBtn)}</h3>
          <button type="button" class="filter-sheet-close-btn" id="insightsFilterSheetClose" aria-label="${escapeHtml(l.closeAria)}">&times;</button>
        </div>
        <div class="field">
          <label>${escapeHtml(l.categoryLabel)}</label>
          <div class="filter-checkbox-list">${checkboxRows}</div>
        </div>
      </div>
    </div>`;
}
function renderInsightsActiveChips() {
  const l = L();
  const container = document.getElementById("insightsActiveChips");
  if (!container) return;
  const chips = [];
  state.insightsFilterCategory.forEach((id) => chips.push({ id, label: `${l.filterChipCategory}: ${categoryDisplayName(categories, id, id)}` }));
  container.innerHTML = chips.map((c) => `<button type="button" class="filter-chip" data-remove-insights-filter="${c.id}">${escapeHtml(c.label)} ×</button>`).join("");
  container.querySelectorAll("[data-remove-insights-filter]").forEach((btn) => btn.addEventListener("click", () => {
    state.insightsFilterCategory.delete(btn.getAttribute("data-remove-insights-filter"));
    renderInsightsBody();
  }));
}
// Looked up fresh from the DOM, same reasoning as transactions.js's
// closeTxFilterSheet -- see that file's comment.
function closeInsightsFilterSheet() {
  state.insightsFilterSheetOpen = false;
  const backdrop = document.getElementById("insightsFilterSheetBackdrop");
  if (backdrop) backdrop.hidden = true;
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.insightsFilterSheetOpen) closeInsightsFilterSheet(); });
function wireInsightsFilterSheet() {
  const backdrop = document.getElementById("insightsFilterSheetBackdrop");
  const openBtn = document.getElementById("openInsightsFiltersBtn");
  const closeBtn = document.getElementById("insightsFilterSheetClose");
  if (!openBtn) return;
  openBtn.addEventListener("click", () => { state.insightsFilterSheetOpen = true; backdrop.hidden = false; });
  closeBtn.addEventListener("click", closeInsightsFilterSheet);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeInsightsFilterSheet(); });
  document.querySelectorAll("[data-insights-filter-cat]").forEach((cb) => cb.addEventListener("change", () => {
    const id = cb.getAttribute("data-insights-filter-cat");
    if (cb.checked) state.insightsFilterCategory.add(id); else state.insightsFilterCategory.delete(id);
    renderInsightsBody();
  }));
}
export function renderInsightsBody() {
  const l = L();
  const body = $("insightsBody");
  const isYearMode = state.insightsPeriodMode === "year";
  const isRangeMode = state.insightsPeriodMode === "today" || state.insightsPeriodMode === "custom";
  const targetMonthKey = state.insightsYear + "-" + state.insightsMonthNum;
  const [rangeFrom, rangeTo] = isRangeMode ? insightsRangeBounds() : ["", ""];
  if (state.insightsTab === "budgets") {
    const rows = isRangeMode ? computeBudgetsForRange(rangeFrom, rangeTo) : (isYearMode ? computeBudgetsForYear(state.insightsYear) : computeBudgets(targetMonthKey));
    const unbudgeted = isRangeMode ? unbudgetedSpendForRange(rangeFrom, rangeTo) : (isYearMode ? unbudgetedSpendForYear(state.insightsYear) : unbudgetedSpend(targetMonthKey));
    body.innerHTML = `<div class="insight-cards">${rows.map((b) => `
      <div class="insight-card">
        <div class="head"><span class="cat">${escapeHtml(b.category)}</span><span class="badge ${b.badgeClass}">${escapeHtml(b.statusLabel)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${b.pct}%;background:${b.barColor}"></div></div>
        <div class="foot"><span>${b.spentFmt} ${escapeHtml(l.spentSoFar)}</span><span>${escapeHtml(l.budgetOf)} ${b.limitFmt}</span></div>
      </div>`).join("")}${unbudgeted > 0 ? `
      <div class="insight-card">
        <div class="head"><span class="cat">${escapeHtml(l.unbudgetedSpending)}</span><span class="badge badge-warn">${fmtMoney(unbudgeted)}</span></div>
        <div class="foot"><span>${escapeHtml(l.unbudgetedSpendingHint)}</span></div>
        <button type="button" class="btn btn-ghost" id="addBudgetFromInsightsBtn" style="margin-top:6px;padding:0">${escapeHtml(l.addBudgetBtn)}</button>
      </div>` : ""}</div>`;
    const addFromInsights = $("addBudgetFromInsightsBtn");
    if (addFromInsights) addFromInsights.addEventListener("click", () => {
      // Jump straight to Settings' "add budget" inline form rather than
      // just the Manage section -- same effect as expanding the Budgets
      // group there and clicking "+ Add budget" by hand.
      state.settingsGroupOpen.budgets = true;
      state.budgetEditId = "new";
      setTab("settings");
    });
  } else if (state.insightsTab === "breakdown") {
    const rows = isRangeMode ? computeBreakdownForRange(rangeFrom, rangeTo, state.insightsFilterCategory) : (isYearMode ? computeBreakdownForYear(state.insightsYear, state.insightsFilterCategory) : computeBreakdown(targetMonthKey, state.insightsFilterCategory));
    const periodLbl = periodDisplayLabel();
    const listHtml = rows.map((d) => `
        <div class="breakdown-row">
          <div class="row1"><span><span class="legend-dot" style="background:${d.color}"></span>${escapeHtml(d.category)}</span><span class="right">${d.totalFmt} · ${Math.round(d.sharePct)}%</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${d.pct}%;background:${d.color}"></div></div>
        </div>`).join("") || `<div class="empty-note">${escapeHtml(l.noExpensesPeriod)}</div>`;
    body.innerHTML = `
      <div class="filter-toolbar">
        <button type="button" class="btn btn-secondary filters-btn" id="openInsightsFiltersBtn">
          <span>${escapeHtml(l.filtersBtn)}</span><span class="filter-badge" id="insightsFiltersBadge" ${state.insightsFilterCategory.size ? "" : "hidden"}>${state.insightsFilterCategory.size}</span>
        </button>
      </div>
      <div class="active-filter-chips" id="insightsActiveChips"></div>
      <div style="font-size:12px;color:var(--color-muted);margin-bottom:14px">${escapeHtml(l.expenseByCategory)} — ${escapeHtml(periodLbl)}</div>
      ${rows.length ? `
      <div class="breakdown-columns">
        <div style="display:flex;justify-content:center;margin-bottom:16px">${pieChartSvg(rows)}</div>
        <div class="card" style="padding:16px">${listHtml}</div>
      </div>` : listHtml}
      ${insightsFilterSheetHtml()}
    `;
    renderInsightsActiveChips();
    wireInsightsFilterSheet();
  } else {
    const trend = computeTrend();
    body.innerHTML = trend.length ? `
      <div class="trend-legend">
        <span><span class="swatch" style="background:var(--color-income)"></span>${escapeHtml(l.incomeLabel)}</span>
        <span><span class="swatch" style="background:var(--color-accent)"></span>${escapeHtml(l.expenseLabel)}</span>
      </div>
      <div class="trend-chart-card">
        <div class="trend-chart">
          ${trend.map((m) => `<div class="trend-col"><div class="trend-bars"><div class="bar" style="background:var(--color-income);height:${m.incomeH}px"></div><div class="bar" style="background:var(--color-accent);height:${m.expenseH}px"></div></div></div>`).join("")}
        </div>
        <div class="trend-labels">${trend.map((m) => `<div>${escapeHtml(m.label)}</div>`).join("")}</div>
      </div>
    ` : `<div class="empty-note">${escapeHtml(l.noResults)}</div>`;
  }
  refreshIcons();
}
