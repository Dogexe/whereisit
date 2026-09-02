import { L } from "../i18n.js";
import { state, categories } from "../state.js";
import { $, escapeHtml, fmtMoney, icon, refreshIcons, monthNameFull, createFocusTrap, localDateIso, sheetGrabberHtml, wireSheetDrag } from "../utils.js";
import { categoryDisplayName } from "../categories.js";
import {
  yearLabel, computeBudgets, computeBudgetsForYear,
  unbudgetedSpend, unbudgetedSpendForYear,
  computeBreakdown, computeBreakdownForYear, computeBreakdownForRange, pieChartSvg, computeTrend
} from "../derived.js";
import { pillPickerHtml, wirePillPicker } from "./period-picker.js";
import { setTab } from "./router.js";

function todayIso() { return localDateIso(); }
function pad2(n) { return String(n).padStart(2, "0"); }

export function renderInsights() {
  const l = L();
  $("screen").innerHTML = `
    <h2 class="screen-title" style="margin-bottom:12px">${escapeHtml(l.financialOverview)}</h2>
    <div class="tabs block" id="insightsModeTabs" role="radiogroup">
      <label class="tab-opt"><input type="radio" name="insights-tab" value="budgets" ${state.insightsTab === "budgets" ? "checked" : ""}>${escapeHtml(l.budgetsTab)}</label>
      <label class="tab-opt"><input type="radio" name="insights-tab" value="breakdown" ${state.insightsTab === "breakdown" ? "checked" : ""}>${escapeHtml(l.categoryTab)}</label>
      <label class="tab-opt"><input type="radio" name="insights-tab" value="trend" ${state.insightsTab === "trend" ? "checked" : ""}>${escapeHtml(l.trendTab)}</label>
    </div>
    <div id="insightsBody"></div>
  `;
  renderInsightsBody();
  document.querySelectorAll('input[name="insights-tab"]').forEach((r) => r.addEventListener("change", (e) => {
    state.insightsTab = e.target.value;
    renderInsightsBody();
  }));
}

// — Budgets tab: a single pill, no Today shortcut (Budgets has no
// "today" concept -- see period-picker.js's pillPickerHtml doc comment). —
function renderBudgetsToolbar() {
  const row = $("budgetsToolbarRow");
  if (!row) return;
  row.innerHTML = `<div class="toolbar">${pillPickerHtml("budgets", state.insightsBudgetsMode, state.insightsBudgetsMonthNum, state.insightsBudgetsYear, state.insightsBudgetsPopoverOpen, null)}</div>`;
  wirePillPicker("budgets", {
    onStep: (dir) => {
      if (state.insightsBudgetsMode === "year") { state.insightsBudgetsYear = String(Number(state.insightsBudgetsYear) + dir); }
      else {
        let m = Number(state.insightsBudgetsMonthNum) + dir, y = Number(state.insightsBudgetsYear);
        if (m > 12) { m = 1; y++; } else if (m < 1) { m = 12; y--; }
        state.insightsBudgetsMonthNum = pad2(m); state.insightsBudgetsYear = String(y);
      }
      renderBudgetsToolbar(); renderBudgetsContent();
    },
    onToggleOpen: () => { state.insightsBudgetsPopoverOpen = !state.insightsBudgetsPopoverOpen; renderBudgetsToolbar(); },
    onYearStep: (dir) => { state.insightsBudgetsYear = String(Number(state.insightsBudgetsYear) + dir); renderBudgetsToolbar(); },
    onPickWholeYear: () => { state.insightsBudgetsMode = "year"; state.insightsBudgetsPopoverOpen = false; renderBudgetsToolbar(); renderBudgetsContent(); },
    onPickMonth: (monthNum) => { state.insightsBudgetsMode = "month"; state.insightsBudgetsMonthNum = monthNum; state.insightsBudgetsPopoverOpen = false; renderBudgetsToolbar(); renderBudgetsContent(); },
    onClose: () => { state.insightsBudgetsPopoverOpen = false; renderBudgetsToolbar(); }
  });
  refreshIcons();
}
function renderBudgetsContent() {
  const l = L();
  const isYear = state.insightsBudgetsMode === "year";
  const targetMonthKey = state.insightsBudgetsYear + "-" + state.insightsBudgetsMonthNum;
  const rows = isYear ? computeBudgetsForYear(state.insightsBudgetsYear) : computeBudgets(targetMonthKey);
  const unbudgeted = isYear ? unbudgetedSpendForYear(state.insightsBudgetsYear) : unbudgetedSpend(targetMonthKey);
  $("budgetsContent").innerHTML = `
    <div class="insight-cards">${rows.map((b) => `
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
    state.settingsActiveSection = "budgets";
    state.budgetEditId = "new";
    setTab("settings");
  });
}

// — Breakdown ("Categories") tab —
function hasCustomRange() { return !!(state.insightsFilterDateFrom && state.insightsFilterDateTo); }
function customRangeLabel() {
  const short = (iso) => { const [y, m, d] = iso.split("-"); return `${Number(d)}/${m}/${yearLabel(y)}`; };
  const from = state.insightsFilterDateFrom, to = state.insightsFilterDateTo;
  return from === to ? short(from) : `${short(from)} – ${short(to)}`;
}
function breakdownActiveFilterCount() { return (hasCustomRange() ? 1 : 0) + state.insightsFilterCategory.size; }
function clearCustomRange() { state.insightsFilterDateFrom = ""; state.insightsFilterDateTo = ""; }

function renderBreakdownToolbar() {
  const row = $("breakdownToolbarRow");
  if (!row) return;
  const count = breakdownActiveFilterCount();
  const chips = [];
  if (hasCustomRange()) chips.push({ key: "range", label: customRangeLabel() });
  state.insightsFilterCategory.forEach((id) => chips.push({ key: "cat:" + id, label: categoryDisplayName(categories, id, id) }));
  const showPill = !hasCustomRange();
  row.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-row">
        ${showPill ? pillPickerHtml("breakdown", state.insightsBreakdownMode, state.insightsBreakdownMonthNum, state.insightsBreakdownYear, state.insightsBreakdownPopoverOpen, state.insightsBreakdownIsToday ? "today" : null, { shortcuts: [{ key: "today", label: L().periodTodayLabel }], shortLabel: true }) : ""}
        <button type="button" class="btn btn-secondary filters-btn" id="openInsightsFiltersBtn">
          ${icon("filter")}<span>${escapeHtml(L().filtersBtn)}</span><span class="filter-badge" id="insightsFiltersBadge" ${count ? "" : "hidden"}>${count}</span>
        </button>
      </div>
      ${chips.length ? `<div class="active-filter-chips">${chips.map((c) => `<button type="button" class="filter-chip" data-remove-insights-chip="${escapeHtml(c.key)}">${escapeHtml(c.label)} ×</button>`).join("")}</div>` : ""}
    </div>
  `;
  document.querySelectorAll("[data-remove-insights-chip]").forEach((btn) => btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-remove-insights-chip");
    if (key === "range") clearCustomRange();
    else state.insightsFilterCategory.delete(key.slice(4));
    renderBreakdownToolbar(); renderBreakdownContent();
  }));
  if (showPill) wirePillPicker("breakdown", {
    onStep: (dir) => {
      state.insightsBreakdownIsToday = false;
      if (state.insightsBreakdownMode === "year") { state.insightsBreakdownYear = String(Number(state.insightsBreakdownYear) + dir); }
      else {
        let m = Number(state.insightsBreakdownMonthNum) + dir, y = Number(state.insightsBreakdownYear);
        if (m > 12) { m = 1; y++; } else if (m < 1) { m = 12; y--; }
        state.insightsBreakdownMonthNum = pad2(m); state.insightsBreakdownYear = String(y);
      }
      renderBreakdownToolbar(); renderBreakdownContent();
    },
    onToggleOpen: () => { state.insightsBreakdownPopoverOpen = !state.insightsBreakdownPopoverOpen; renderBreakdownToolbar(); },
    onYearStep: (dir) => { state.insightsBreakdownIsToday = false; state.insightsBreakdownYear = String(Number(state.insightsBreakdownYear) + dir); renderBreakdownToolbar(); },
    onPickWholeYear: () => { state.insightsBreakdownMode = "year"; state.insightsBreakdownIsToday = false; state.insightsBreakdownPopoverOpen = false; renderBreakdownToolbar(); renderBreakdownContent(); },
    onPickMonth: (monthNum) => { state.insightsBreakdownMode = "month"; state.insightsBreakdownMonthNum = monthNum; state.insightsBreakdownIsToday = false; state.insightsBreakdownPopoverOpen = false; renderBreakdownToolbar(); renderBreakdownContent(); },
    onPickShortcut: () => { state.insightsBreakdownIsToday = true; state.insightsBreakdownPopoverOpen = false; renderBreakdownToolbar(); renderBreakdownContent(); },
    onClose: () => { state.insightsBreakdownPopoverOpen = false; renderBreakdownToolbar(); }
  });
  const openBtn = $("openInsightsFiltersBtn");
  if (openBtn) openBtn.addEventListener("click", () => { state.insightsFilterSheetOpen = true; renderBreakdownFilterSheet(); insightsFilterFocusTrap.activate(); });
  refreshIcons();
}

function breakdownPeriodLabel() {
  if (hasCustomRange()) return customRangeLabel();
  if (state.insightsBreakdownIsToday) return L().periodTodayLabel;
  if (state.insightsBreakdownMode === "year") return String(yearLabel(state.insightsBreakdownYear));
  return `${monthNameFull(Number(state.insightsBreakdownMonthNum))} ${yearLabel(state.insightsBreakdownYear)}`;
}
function breakdownRangeBounds() {
  if (hasCustomRange()) return [state.insightsFilterDateFrom, state.insightsFilterDateTo];
  const t = todayIso();
  return [t, t];
}
function renderBreakdownContent() {
  const l = L();
  const isYear = !hasCustomRange() && !state.insightsBreakdownIsToday && state.insightsBreakdownMode === "year";
  const isToday = !hasCustomRange() && state.insightsBreakdownIsToday;
  const isRange = hasCustomRange() || isToday;
  const targetMonthKey = state.insightsBreakdownYear + "-" + state.insightsBreakdownMonthNum;
  const rows = isRange ? computeBreakdownForRange(...breakdownRangeBounds(), state.insightsFilterCategory)
    : isYear ? computeBreakdownForYear(state.insightsBreakdownYear, state.insightsFilterCategory)
    : computeBreakdown(targetMonthKey, state.insightsFilterCategory);
  const periodLbl = breakdownPeriodLabel();
  const listHtml = rows.map((d) => `
      <div class="breakdown-row">
        <div class="row1"><span><span class="legend-dot" style="background:${d.color}"></span>${escapeHtml(d.category)}</span><span class="right">${d.totalFmt} · ${state.hideAmounts ? "••" : Math.round(d.sharePct)}%</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${d.pct}%;background:${d.color}"></div></div>
      </div>`).join("") || `<div class="empty-note">${escapeHtml(l.noExpensesPeriod)}</div>`;
  $("breakdownContent").innerHTML = `
    <div class="period-caption">${escapeHtml(l.expenseByCategory)} — ${escapeHtml(periodLbl)}</div>
    ${rows.length ? `
    <div class="breakdown-columns">
      <div class="breakdown-chart">${pieChartSvg(rows)}</div>
      <div class="card" style="padding:16px">${listHtml}</div>
    </div>` : listHtml}
  `;
}

function insightsFilterSheetHtml() {
  const l = L();
  const checkboxRows = categories.filter((c) => c.type === "expense" && !c.deleted).map((c) => `
    <label class="filter-checkbox-row">
      <input type="checkbox" data-insights-filter-cat="${c.id}" ${state.insightsFilterCategory.has(c.id) ? "checked" : ""}>
      <span>${escapeHtml(c.name)}</span>
    </label>`).join("");
  const kind = state.insightsCustomKind;
  return `
    <div class="filter-sheet-backdrop" id="insightsFilterSheetBackdrop" ${state.insightsFilterSheetOpen ? "" : "hidden"}>
      <div class="filter-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(l.filtersBtn)}">
        <div class="filter-sheet-header">
          ${sheetGrabberHtml()}
          <h3>${escapeHtml(l.filtersBtn)}</h3>
          <button type="button" class="filter-sheet-close-btn" id="insightsFilterSheetClose" aria-label="${escapeHtml(l.closeAria)}">&times;</button>
        </div>
        <div class="field">
          <div class="filter-field-label"><span>${escapeHtml(l.customDateLabel)}</span>${hasCustomRange() ? `<button type="button" id="insightsClearRangeBtn">${escapeHtml(l.clearBtn)}</button>` : ""}</div>
          <div class="kind-toggle">
            <button type="button" class="${kind === "single" ? "active" : ""}" data-insights-custom-kind="single">${escapeHtml(l.singleDayLabel)}</button>
            <button type="button" class="${kind === "range" ? "active" : ""}" data-insights-custom-kind="range">${escapeHtml(l.dateRangeLabel)}</button>
          </div>
          ${kind === "single" ? `
            <div class="input-wrap">${icon("calendar", 'style="color:var(--color-accent)"')}<input type="date" id="insightsSingleDate" value="${state.insightsFilterDateFrom === state.insightsFilterDateTo ? escapeHtml(state.insightsFilterDateFrom) : ""}"></div>
            <div class="field-hint">${escapeHtml(l.singleDayHint)}</div>
          ` : `
            <div class="amount-range-row">
              <input type="date" class="input" aria-label="${escapeHtml(l.dateFromLabel)}" id="insightsRangeFrom" value="${escapeHtml(state.insightsFilterDateFrom)}">
              <span>–</span>
              <input type="date" class="input" aria-label="${escapeHtml(l.dateToLabel)}" id="insightsRangeTo" value="${escapeHtml(state.insightsFilterDateTo)}">
            </div>
            <div class="field-hint">${escapeHtml(l.dateRangeHint)}</div>
          `}
        </div>
        <div class="field">
          <label>${escapeHtml(l.categoryLabel)}</label>
          <div class="filter-checkbox-list">${checkboxRows}</div>
        </div>
      </div>
    </div>`;
}
function closeInsightsFilterSheet() {
  state.insightsFilterSheetOpen = false;
  const backdrop = document.getElementById("insightsFilterSheetBackdrop");
  if (backdrop) backdrop.hidden = true;
  insightsFilterFocusTrap.deactivate();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.insightsFilterSheetOpen) closeInsightsFilterSheet(); });
// Looked up fresh on every Tab keypress -- unlike the Transactions/Add
// sheets, this one fully replaces its own inner HTML on almost every field
// change while still open (renderBreakdownFilterSheet), so the trap can't
// hold a reference to a single dialog element; re-querying by id means it
// keeps working across those re-renders without being re-armed each time.
const insightsFilterFocusTrap = createFocusTrap(() => {
  const backdrop = document.getElementById("insightsFilterSheetBackdrop");
  return backdrop && !backdrop.hidden ? backdrop.querySelector(".filter-sheet") : null;
});
function renderBreakdownFilterSheet() {
  const container = $("breakdownFilterSheet");
  if (!container) return;
  container.innerHTML = insightsFilterSheetHtml();
  const backdrop = document.getElementById("insightsFilterSheetBackdrop");
  const closeBtn = document.getElementById("insightsFilterSheetClose");
  const dismiss = () => { closeInsightsFilterSheet(); renderBreakdownFilterSheet(); };
  closeBtn.addEventListener("click", dismiss);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) dismiss(); });
  // Re-wired on every call, not just once: this whole sheet re-renders its
  // markup (a fresh backdrop/grabber element) on almost every field change
  // while open -- see this function's own doc comment above.
  wireSheetDrag(backdrop.querySelector(".sheet-grabber"), backdrop.querySelector(".filter-sheet"), dismiss);
  const clearBtn = document.getElementById("insightsClearRangeBtn");
  if (clearBtn) clearBtn.addEventListener("click", () => { clearCustomRange(); renderBreakdownFilterSheet(); renderBreakdownToolbar(); renderBreakdownContent(); });
  document.querySelectorAll("[data-insights-custom-kind]").forEach((b) => b.addEventListener("click", () => {
    state.insightsCustomKind = b.getAttribute("data-insights-custom-kind");
    renderBreakdownFilterSheet();
  }));
  const singleInput = document.getElementById("insightsSingleDate");
  if (singleInput) singleInput.addEventListener("change", () => {
    state.insightsFilterDateFrom = singleInput.value;
    state.insightsFilterDateTo = singleInput.value;
    renderBreakdownFilterSheet(); renderBreakdownToolbar(); renderBreakdownContent();
  });
  const fromInput = document.getElementById("insightsRangeFrom");
  const toInput = document.getElementById("insightsRangeTo");
  if (fromInput && toInput) {
    const apply = () => {
      let from = fromInput.value, to = toInput.value;
      if (from && to && from > to) { const t = from; from = to; to = t; }
      state.insightsFilterDateFrom = from; state.insightsFilterDateTo = to;
      if (from && to) { renderBreakdownFilterSheet(); renderBreakdownToolbar(); renderBreakdownContent(); }
    };
    fromInput.addEventListener("change", apply);
    toInput.addEventListener("change", apply);
  }
  document.querySelectorAll("[data-insights-filter-cat]").forEach((cb) => cb.addEventListener("change", () => {
    const id = cb.getAttribute("data-insights-filter-cat");
    if (cb.checked) state.insightsFilterCategory.add(id); else state.insightsFilterCategory.delete(id);
    renderBreakdownToolbar(); renderBreakdownContent();
  }));
  refreshIcons();
}

export function renderInsightsBody() {
  const l = L();
  const body = $("insightsBody");
  if (state.insightsTab === "budgets") {
    body.innerHTML = `<div id="budgetsToolbarRow"></div><div id="budgetsContent"></div>`;
    renderBudgetsToolbar();
    renderBudgetsContent();
  } else if (state.insightsTab === "breakdown") {
    body.innerHTML = `<div id="breakdownToolbarRow"></div><div id="breakdownContent"></div><div id="breakdownFilterSheet"></div>`;
    renderBreakdownToolbar();
    renderBreakdownContent();
    renderBreakdownFilterSheet();
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
