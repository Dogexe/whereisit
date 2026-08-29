import { L } from "../i18n.js";
import { escapeHtml, monthLabel, monthNameShort, monthNameFull, icon, dateLabel } from "../utils.js";
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

// ---------------------------------------------------------------------
// Insights redesign (docs/specs/insights-period-picker-redesign.md):
// one pill component, Insights-only (Transactions keeps the plain
// two-select version above untouched), shared by both the Budgets and
// Breakdown ("Categories") tabs -- prev/next steppers flanking a
// centered calendar icon + resolved label, opening a popover with a
// year stepper and a 4x3 month grid; tapping the year heading inside the
// popover switches to a whole-year view rather than exposing a separate
// "year" mode. After several rounds this converged on being *exactly*
// the same control for every tab that needs it (an earlier revision gave
// Breakdown a separate Today/Month/Year tab row, then a paginated
// 12-year grid for a dedicated Year tab -- both removed once the user
// asked for parity with Budgets' plain pill instead), with the only
// difference being a per-caller row of one-tap shortcut buttons: Budgets
// needs none, Breakdown needs one ("today"), Transactions needs two
// ("all", "today"). That's `opts.shortcuts`, not a second implementation
// -- keeping this as one function is what stops per-tab pills from
// silently drifting apart the next time any of them needs a tweak.
const SHORTCUT_ICON = { today: "sun", all: "globe" };
function shortcutPillLabel(key, label) {
  // "today" gets the richer "<label> · <date>" pill text (matching what
  // shipped for Insights' Breakdown tab); any other shortcut (e.g.
  // Transactions' "all") just shows its own label verbatim once active,
  // since there's no secondary value ("all" isn't a specific day) to
  // append.
  return key === "today" ? `${label} · ${dateLabel(new Date().toISOString().slice(0, 10))}` : label;
}
export function pillPickerHtml(id, mode, monthNum, year, popoverOpen, activeShortcut, opts) {
  const l = L();
  const shortcuts = (opts && opts.shortcuts) || [];
  const activeDef = shortcuts.find((s) => s.key === activeShortcut);
  const isYear = mode === "year";
  const label = activeDef ? shortcutPillLabel(activeDef.key, activeDef.label) : (isYear ? `${l.periodYearLabel} ${yearLabel(year)}` : `${monthNameFull(Number(monthNum))} ${yearLabel(year)}`);
  const monthCells = Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
    const mm = String(m).padStart(2, "0");
    const isSel = !activeDef && !isYear && m === Number(monthNum);
    return `<button type="button" class="picker-month-cell${isSel ? " selected" : ""}" data-pill-pick-month="${id}" data-month="${mm}">${escapeHtml(monthNameShort(m))}</button>`;
  }).join("");
  return `
    <div class="picker-anchor">
      <div class="period-pill-row">
        <div class="period-pill wide">
          <button type="button" class="step" data-pill-step="-1" data-picker="${id}" aria-label="${escapeHtml(l.prevAria)}">${icon("chevron-left")}</button>
          <button type="button" class="trigger" data-pill-open="${id}" aria-expanded="${popoverOpen}">${icon("calendar")}<span>${escapeHtml(label)}</span></button>
          <button type="button" class="step" data-pill-step="1" data-picker="${id}" aria-label="${escapeHtml(l.nextAria)}">${icon("chevron-right")}</button>
        </div>
      </div>
      <div class="picker-popover${popoverOpen ? " open" : ""}">
        ${shortcuts.length ? `
        <div class="shortcut-row">
          ${shortcuts.map((sc) => `<button type="button" class="shortcut-btn${sc.key === activeShortcut ? " active" : ""}" data-pill-shortcut="${id}" data-shortcut-key="${escapeHtml(sc.key)}">${icon(SHORTCUT_ICON[sc.key] || "calendar")}<span>${escapeHtml(sc.key === "today" ? shortcutPillLabel(sc.key, sc.label) : sc.label)}</span></button>`).join("")}
        </div>` : ""}
        <div class="picker-year-row">
          <button type="button" class="step" data-pill-year-step="-1" data-picker="${id}" aria-label="${escapeHtml(l.prevAria)}">${icon("chevron-left")}</button>
          <button type="button" class="picker-year-heading${isYear && !activeDef ? " selected" : ""}" data-pill-pick-year="${id}">${escapeHtml(yearLabel(year))}</button>
          <button type="button" class="step" data-pill-year-step="1" data-picker="${id}" aria-label="${escapeHtml(l.nextAria)}">${icon("chevron-right")}</button>
        </div>
        <div class="picker-month-grid">${monthCells}</div>
        <div class="picker-hint">${escapeHtml(l.tapYearForWholeYear.replace("{year}", yearLabel(year)))}</div>
      </div>
    </div>
    <div class="picker-backdrop${popoverOpen ? " open" : ""}" data-pill-backdrop="${id}"></div>
  `;
}
// handlers: { onStep(dir), onToggleOpen(), onYearStep(dir), onPickWholeYear(),
// onPickMonth(monthNum), onPickShortcut(key), onClose() }. onStep steps
// the pill's own prev/next -- month-by-month in month mode, year-by-year
// in year mode (the caller decides which, since it owns which mode is
// active, and clears its own active-shortcut state either way);
// onYearStep always steps a year at a time, used to browse the popover's
// month grid across different years without leaving month mode.
// onPickShortcut(key) fires with whichever shortcut's key was tapped,
// only wired when the caller passed at least one `opts.shortcuts` entry
// at render time; the caller distinguishes which one fired by `key`.
// Also scrolls the popover into view when opening it (a no-op if it's
// already fully visible) -- Transactions' pill lives inside a scrolling
// Filters sheet, where a popover opened near the bottom of the sheet can
// render below the currently-visible fold.
export function wirePillPicker(id, handlers) {
  document.querySelectorAll(`[data-pill-step][data-picker="${id}"]`).forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation(); handlers.onStep(Number(b.getAttribute("data-pill-step")));
  }));
  const openBtn = document.querySelector(`[data-pill-open="${id}"]`);
  if (openBtn) openBtn.addEventListener("click", handlers.onToggleOpen);
  document.querySelectorAll(`[data-pill-year-step][data-picker="${id}"]`).forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation(); handlers.onYearStep(Number(b.getAttribute("data-pill-year-step")));
  }));
  const yearHeading = document.querySelector(`[data-pill-pick-year="${id}"]`);
  if (yearHeading) yearHeading.addEventListener("click", handlers.onPickWholeYear);
  document.querySelectorAll(`[data-pill-pick-month="${id}"]`).forEach((b) => b.addEventListener("click", () => handlers.onPickMonth(b.getAttribute("data-month"))));
  document.querySelectorAll(`[data-pill-shortcut="${id}"]`).forEach((b) => b.addEventListener("click", () => handlers.onPickShortcut(b.getAttribute("data-shortcut-key"))));
  const backdrop = document.querySelector(`[data-pill-backdrop="${id}"]`);
  if (backdrop) backdrop.addEventListener("click", handlers.onClose);
  const anchor = openBtn ? openBtn.closest(".picker-anchor") : null;
  const popoverEl = anchor ? anchor.querySelector(".picker-popover.open") : null;
  if (popoverEl) requestAnimationFrame(() => popoverEl.scrollIntoView({ block: "nearest", behavior: "smooth" }));
}
