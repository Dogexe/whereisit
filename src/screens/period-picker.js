import { L } from "../i18n.js";
import { escapeHtml, monthNameShort, monthNameFull, icon, dateLabel, localDateIso } from "../utils.js";
import { yearLabel } from "../derived.js";

// ---------------------------------------------------------------------
// Insights redesign (docs/specs/insights-period-picker-redesign.md):
// one pill component, shared by Insights' Budgets and Breakdown
// ("Categories") tabs and (per transactions-period-picker-unification.md)
// Transactions too -- prev/next steppers flanking a
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
  // Used only for the main pill's own trigger label once a shortcut is
  // active (see pillPickerHtml below) -- "today" gets the richer
  // "<label> · <date>" text there, since the trigger is the one place in
  // the row with room for it. The shortcut *buttons* themselves (in the
  // popover's shortcut row) always show their own plain label with no
  // date appended -- the date is already visible on the trigger above
  // them, so repeating it on the smaller button was both redundant and
  // the thing that made "Today · 30/08/2026" cramped next to "All".
  return key === "today" ? `${label} · ${dateLabel(localDateIso())}` : label;
}
// "AUG 26" -- short month name (locale-aware, via monthNameShort) + the
// display year's last two digits (via yearLabel, so Thai's Buddhist-era
// year shortens the same way Gregorian does). Opt-in per caller
// (opts.shortLabel) rather than applied to every pill: Budgets' pill is
// full-width with no Filters button beside it, so it never had the
// overflow risk that prompted this, and changing its label format without
// being asked would be a bigger visual change than requested.
function monthYearLabel(monthNum1to12, year, short) {
  return short
    ? `${monthNameShort(monthNum1to12).toUpperCase()} ${yearLabel(year).slice(-2)}`
    : `${monthNameFull(monthNum1to12)} ${yearLabel(year)}`;
}
export function pillPickerHtml(id, mode, monthNum, year, popoverOpen, activeShortcut, opts) {
  const l = L();
  const shortcuts = (opts && opts.shortcuts) || [];
  const activeDef = shortcuts.find((s) => s.key === activeShortcut);
  const isYear = mode === "year";
  const label = activeDef ? shortcutPillLabel(activeDef.key, activeDef.label) : (isYear ? `${l.periodYearLabel} ${yearLabel(year)}` : monthYearLabel(Number(monthNum), year, !!(opts && opts.shortLabel)));
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
          ${shortcuts.map((sc) => `<button type="button" class="shortcut-btn${sc.key === activeShortcut ? " active" : ""}" data-pill-shortcut="${id}" data-shortcut-key="${escapeHtml(sc.key)}">${icon(SHORTCUT_ICON[sc.key] || "calendar")}<span>${escapeHtml(sc.label)}</span></button>`).join("")}
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
// Requested after live use surfaced it: the popover's CSS centers it on
// its own anchor (left:50%; transform:translateX(-50%)), which is correct
// when the anchor spans the full row (Budgets' standalone pill) but wrong
// whenever the anchor shares its row with something else (Breakdown's and
// Transactions' pills, both sitting beside a Filters button) -- the
// anchor's own midpoint then sits left of the screen's true center, so a
// popover wide enough relative to a narrow (mobile) viewport gets pushed
// past the right edge and clipped, not just visually off-center. Rather
// than hand-tuning CSS per caller, this measures the popover's actual
// rendered position after it opens and nudges it back on-screen with a
// plain margin-left offset, leaving the CSS centering as the (correct,
// unmodified) starting point for the common case where nothing overflows.
function clampPopoverToViewport(popoverEl) {
  if (!popoverEl) return;
  popoverEl.style.marginLeft = "";
  const margin = 8;
  const rect = popoverEl.getBoundingClientRect();
  let shift = 0;
  if (rect.left < margin) shift = margin - rect.left;
  else if (rect.right > window.innerWidth - margin) shift = (window.innerWidth - margin) - rect.right;
  if (shift !== 0) popoverEl.style.marginLeft = `${shift}px`;
}
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
  if (popoverEl) requestAnimationFrame(() => {
    clampPopoverToViewport(popoverEl);
    popoverEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}
