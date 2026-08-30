import { state } from "./state.js";

export const $ = (id) => document.getElementById(id);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// The single source of truth for "is the desktop sidebar shell active"
// (matching styles.css's own 1024px sidebar/tab-bar breakpoint) -- used
// wherever behavior, not just layout, needs to branch on it (e.g.
// docs/specs/add-transaction-bottom-sheet.md's Add button/editTx()),
// so every call site checks the same way instead of each guessing at
// the breakpoint value independently.
export const isDesktopShell = () => window.matchMedia("(min-width: 1024px)").matches;
export const monthKey = (iso) => iso.slice(0, 7);
export function fmtMoney(n) { return "฿" + Number(n).toLocaleString(state.lang === "en" ? "en-US" : "th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
const BE_YEAR_OFFSET = 543;
// The single place both display (dateLabel) and input parsing
// (parseDateText) go through to convert between the year stored/computed
// internally (always Gregorian) and what the active language's UI shows
// or accepts typed. Thai UI reads Buddhist Era (Gregorian + 543), English
// UI reads Gregorian unchanged, matching what each audience expects --
// derived.js's yearLabel (used for the year picker in Insights) delegates
// here too rather than duplicating the +543 offset.
export function displayYear(gregorianYear) { return state.lang === "en" ? gregorianYear : Number(gregorianYear) + BE_YEAR_OFFSET; }
export function gregorianYearFromDisplay(typedYear) { return state.lang === "en" ? typedYear : typedYear - BE_YEAR_OFFSET; }
export function dateLabel(iso) { const [y, m, d] = iso.split("-"); return d + "/" + m + "/" + displayYear(Number(y)); }
export function formatDateTyping(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length > 4) return digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
  if (digits.length > 2) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits;
}
// `text` is whatever the active language displays/types -- a Buddhist Era
// year in Thai, Gregorian in English (see dateLabel/displayYear above).
// Converted back to a Gregorian ISO date via gregorianYearFromDisplay
// before validating, so round-tripping (format then parse) returns the
// original ISO date in either language.
export function parseDateText(text) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), typedYear = parseInt(m[3], 10);
  const y = gregorianYearFromDisplay(typedYear);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const iso = String(y).padStart(4, "0") + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  const dt = new Date(iso + "T00:00:00");
  if (isNaN(dt.getTime()) || dt.getDate() !== d || dt.getMonth() + 1 !== mo || dt.getFullYear() !== y) return null;
  return iso;
}
export function monthLabel(key) { return new Date(key + "-01T00:00:00").toLocaleDateString(state.lang === "en" ? "en-US" : "th-TH", { month: "short", year: "2-digit" }); }
// Locale month names with no year attached -- used by the Insights period
// pickers' month-grid cells (monthNameShort) and pill/segment label
// (monthNameFull), which show the year separately. Going through
// toLocaleDateString (rather than a hardcoded name array) means these stay
// correct automatically if another language is ever added.
export function monthNameShort(monthNum1to12) { return new Date(2000, monthNum1to12 - 1, 1).toLocaleDateString(state.lang === "en" ? "en-US" : "th-TH", { month: "short" }); }
export function monthNameFull(monthNum1to12) { return new Date(2000, monthNum1to12 - 1, 1).toLocaleDateString(state.lang === "en" ? "en-US" : "th-TH", { month: "long" }); }
export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
// References the self-hosted icons/sprite.svg (a <symbol> per icon this
// app actually uses -- see that file's own doc comment) rather than the
// CDN-loaded lucide.js this used to depend on. <use> renders immediately
// once inserted, with no separate JS "activation" pass, so this markup is
// valid on its own the moment it's part of the page -- unlike the old
// <i data-lucide="name"> placeholder, which stayed an empty, invisible
// element until lucide.createIcons() ran (and stayed invisible forever if
// that script had never loaded, e.g. offline before its first successful
// fetch -- exactly the bug this replaces).
export function icon(name, attrs) { return `<svg class="icon"${attrs ? " " + attrs : ""} aria-hidden="true"><use href="./icons/sprite.svg#${name}"></use></svg>`; }
export function iconAvatar(name, bg, color, sizeClass, iconAttrs) {
  return `<div class="icon-avatar${sizeClass ? " " + sizeClass : ""}" style="background:${bg};color:${color}">${icon(name, iconAttrs)}</div>`;
}
export const EDIT_ICON = icon("pencil");
export const DELETE_ICON = icon("trash-2");
export const PLUS_ICON = icon("plus");
// No-op: icon() above now renders real, immediately-valid SVG, so there's
// no lucide.createIcons()-style activation pass left to run. Kept (rather
// than deleting every "refresh icons after rendering" call site across
// every screen) since each one is still harmless to call; safe to remove
// entirely in a future cleanup pass.
export function refreshIcons() {}
// Builds <option> tags for a plain list of value strings. `labelFn` maps a
// value to display text (defaults to the value itself); pass null as
// `selected` when nothing should be pre-selected.
export function optionsHtml(values, selected, labelFn) {
  return values.map((v) => `<option value="${escapeHtml(v)}"${v === selected ? " selected" : ""}>${escapeHtml(labelFn ? labelFn(v) : v)}</option>`).join("");
}
const FOCUSABLE_SELECTOR = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function trapFocusableElements(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null);
}
// Shared focus trap for the app's dialog/sheet overlays (Transactions' and
// Insights' Filters sheets, the Add/Edit bottom sheet) -- keeps Tab/Shift+Tab
// cycling within the open sheet instead of leaking focus into the page
// content it's covering. `getContainer` is a function, not an element,
// because some of these sheets fully replace their own inner HTML while
// still open (e.g. insights.js's renderBreakdownFilterSheet on every field
// change) -- looking the container up fresh on every keydown, the same
// pattern this codebase already uses for its module-level Escape listeners,
// means the trap keeps working across those re-renders without needing to
// be re-armed each time. It should return the current dialog element (not
// its backdrop) when the sheet is open, or a falsy value when it's closed.
export function createFocusTrap(getContainer) {
  let previouslyFocused = null;
  function onKeydown(e) {
    if (e.key !== "Tab") return;
    const container = getContainer();
    if (!container) return;
    const focusables = trapFocusableElements(container);
    if (!focusables.length) { e.preventDefault(); return; }
    const first = focusables[0], last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !container.contains(active)) { e.preventDefault(); last.focus(); }
    } else if (active === last || !container.contains(active)) {
      e.preventDefault(); first.focus();
    }
  }
  document.addEventListener("keydown", onKeydown);
  return {
    // Call once, right after the sheet becomes visible in the DOM. Saves
    // whatever had focus (the button that opened the sheet) so it can be
    // restored on deactivate(), then moves focus to the first focusable
    // element inside the sheet -- in every one of this app's sheets that's
    // the close button, since it's the first thing in DOM order, so no
    // separate "or the close button" fallback branch is needed.
    activate() {
      previouslyFocused = document.activeElement;
      const container = getContainer();
      if (!container) return;
      const first = trapFocusableElements(container)[0];
      if (first) first.focus();
    },
    // Call once, right when the sheet closes (Escape, close button,
    // backdrop tap -- every dismissal path already converges on one
    // close*Sheet() function per sheet, so this only needs one call site).
    deactivate() {
      if (previouslyFocused && document.body.contains(previouslyFocused)) previouslyFocused.focus();
      previouslyFocused = null;
    }
  };
}
