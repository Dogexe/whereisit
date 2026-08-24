import { L } from "../i18n.js";
import { escapeHtml, monthLabel } from "../utils.js";
import { availableYears, availableMonthKeys, yearLabel } from "../derived.js";

// Shared by Insights (modes ["month","year"]) and Transactions (modes
// ["all","month","year"]) so both screens' period selector looks and
// behaves the same -- two plain <select>s (mode, then value) sitting in
// one filter-row, matching the weight of the app's other filter selects
// (Day, Category) rather than introducing a heavier tabs+pill pattern.
export function periodPickerHtml(name, modes, mode, monthNum, year) {
  const l = L();
  const modeLabels = { all: l.filterAll, month: l.periodMonthLabel, year: l.periodYearLabel };
  const monthOptionsHtml = () => availableMonthKeys().map((k) => `<option value="${k}" ${k === year + "-" + monthNum ? "selected" : ""}>${escapeHtml(monthLabel(k))}</option>`).join("");
  const yearOptionsHtml = () => availableYears().map((y) => `<option value="${y}" ${y === year ? "selected" : ""}>${escapeHtml(String(yearLabel(y)))}</option>`).join("");
  return `
    <select class="input" data-period-mode="${name}">
      ${modes.map((m) => `<option value="${m}" ${mode === m ? "selected" : ""}>${escapeHtml(modeLabels[m])}</option>`).join("")}
    </select>
    ${mode === "month" ? `<select class="input" data-period-value="${name}">${monthOptionsHtml()}</select>` : ""}
    ${mode === "year" ? `<select class="input" data-period-value="${name}">${yearOptionsHtml()}</select>` : ""}
  `;
}
// handlers: { onMode(mode), onValue(value) } -- value is a "YYYY-MM" month
// key in month mode, a plain "YYYY" year in year mode. Call once after the
// picker's HTML has been inserted into the DOM.
export function wirePeriodPicker(name, handlers) {
  document.querySelector(`[data-period-mode="${name}"]`).addEventListener("change", (e) => handlers.onMode(e.target.value));
  const valueSelect = document.querySelector(`[data-period-value="${name}"]`);
  if (valueSelect) valueSelect.addEventListener("change", (e) => handlers.onValue(e.target.value));
}
