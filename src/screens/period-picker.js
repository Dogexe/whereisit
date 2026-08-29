import { L } from "../i18n.js";
import { escapeHtml, monthLabel } from "../utils.js";
import { availableYears, availableMonthKeys, yearLabel } from "../derived.js";

// Shared by Insights (modes ["today","month","year","custom"]) and
// Transactions (modes ["all","today","month","year","custom"]) so both
// screens' period selector looks and behaves the same -- two plain
// <select>s (mode, then value) sitting in one filter-row, matching the
// weight of the app's other filter selects (Day, Category) rather than
// introducing a heavier tabs+pill pattern. "custom" mode swaps the second
// select for two <input type="date"> fields instead; "today" needs no
// second control at all (like "all") -- it's always just today's date,
// computed live rather than stored.
export function periodPickerHtml(name, modes, mode, monthNum, year, rangeFrom, rangeTo) {
  const l = L();
  const modeLabels = { all: l.filterAll, today: l.periodTodayLabel, month: l.periodMonthLabel, year: l.periodYearLabel, custom: l.periodCustomLabel };
  const monthOptionsHtml = () => availableMonthKeys().map((k) => `<option value="${k}" ${k === year + "-" + monthNum ? "selected" : ""}>${escapeHtml(monthLabel(k))}</option>`).join("");
  const yearOptionsHtml = () => availableYears().map((y) => `<option value="${y}" ${y === year ? "selected" : ""}>${escapeHtml(String(yearLabel(y)))}</option>`).join("");
  return `
    <select class="input" data-period-mode="${name}">
      ${modes.map((m) => `<option value="${m}" ${mode === m ? "selected" : ""}>${escapeHtml(modeLabels[m])}</option>`).join("")}
    </select>
    ${mode === "month" ? `<select class="input" data-period-value="${name}">${monthOptionsHtml()}</select>` : ""}
    ${mode === "year" ? `<select class="input" data-period-value="${name}">${yearOptionsHtml()}</select>` : ""}
    ${mode === "custom" ? `
      <input type="date" class="input" aria-label="${escapeHtml(l.dateFromLabel)}" data-period-range-from="${name}" value="${escapeHtml(rangeFrom || "")}">
      <input type="date" class="input" aria-label="${escapeHtml(l.dateToLabel)}" data-period-range-to="${name}" value="${escapeHtml(rangeTo || "")}">
    ` : ""}
  `;
}
// handlers: { onMode(mode), onValue(value), onRange(from, to) } -- value is
// a "YYYY-MM" month key in month mode, a plain "YYYY" year in year mode;
// onRange gets both date inputs' current ISO values whenever either
// changes. Call once after the picker's HTML has been inserted into the DOM.
export function wirePeriodPicker(name, handlers) {
  document.querySelector(`[data-period-mode="${name}"]`).addEventListener("change", (e) => handlers.onMode(e.target.value));
  const valueSelect = document.querySelector(`[data-period-value="${name}"]`);
  if (valueSelect) valueSelect.addEventListener("change", (e) => handlers.onValue(e.target.value));
  const fromInput = document.querySelector(`[data-period-range-from="${name}"]`);
  const toInput = document.querySelector(`[data-period-range-to="${name}"]`);
  if (fromInput && toInput && handlers.onRange) {
    const fire = () => handlers.onRange(fromInput.value, toInput.value);
    fromInput.addEventListener("change", fire);
    toInput.addEventListener("change", fire);
  }
}
