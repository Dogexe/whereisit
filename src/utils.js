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
// The canonical "what is today/this month, for this user" building block.
// `new Date().toISOString()` converts to UTC first -- for anyone east of
// UTC (e.g. Bangkok, UTC+7) that reads as the wrong calendar day for
// several hours after their local midnight, since UTC hasn't rolled over
// yet. Every "now" computation in this app (today's date, this month's
// key, a bill's due-today check, etc.) must go through localDateIso/
// localMonthKey (or monthKeyOf, for an arbitrary already-in-hand Date
// object) instead of `.toISOString().slice(...)`. Sync/conflict-resolution
// timestamps (sync.js's/push.js's `updated_at`) are a deliberate exception
// -- those are UTC by design, not user-facing "today," and stay as-is.
export function localIsoFromDate(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}
export function monthKeyOf(date) { return localIsoFromDate(date).slice(0, 7); }
export function localDateIso() { return localIsoFromDate(new Date()); }
export function localMonthKey() { return monthKeyOf(new Date()); }
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
// Background-scroll lock for the app's dialog/sheet overlays -- neither
// body nor html was ever scroll-locked while a sheet was open (this app has
// no separate scrolling container of its own; the whole document scrolls),
// so a real drag/wheel gesture over the dimmed backdrop could move the page
// underneath a still-open sheet. Reference-counted (not a plain boolean) in
// case two sheets are ever activated without the first deactivating first --
// doesn't happen today, but costs nothing to guard against. Piggybacks on
// createFocusTrap's activate()/deactivate() below rather than being its own
// separate call site: every sheet already calls exactly those two methods at
// exactly the moments scroll should lock/unlock, so no sheet needs a second,
// easy-to-forget call added alongside its focus-trap wiring.
let scrollLockCount = 0;
let savedOverflow = null;
function lockPageScroll() {
  if (scrollLockCount === 0) {
    savedOverflow = { body: document.body.style.overflow, html: document.documentElement.style.overflow };
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  }
  scrollLockCount++;
}
function unlockPageScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0 && savedOverflow) {
    document.body.style.overflow = savedOverflow.body;
    document.documentElement.style.overflow = savedOverflow.html;
    savedOverflow = null;
  }
}
// Keeps an open bottom sheet's backdrop sized to the actually-visible
// viewport, not the full layout viewport. Real bug reported directly by the
// user ("keypad push entire bottom page up"): most mobile browsers handle
// the on-screen keyboard by shrinking only the *visual* viewport, leaving
// the *layout* viewport (what position:fixed/inset:0 and plain vh units are
// relative to) exactly as tall as before -- so .filter-sheet-backdrop's
// `inset: 0` still claimed the pre-keyboard full height, and the browser's
// own "scroll the focused input into view" behavior had to scroll the
// *whole* fixed-position sheet (sticky header, Save button, and all) up and
// off-screen to bring a bottom-of-form field above the keyboard, instead of
// just scrolling that field within the sheet's own small remaining space.
// The visualViewport API (broad support: Safari 13+, Chrome 62+) reports
// the real, keyboard-adjusted visible height directly; syncing the backdrop
// (and the sheet's own max-height, proportionally) to it means the
// browser's native scroll-into-view only ever has to move the input within
// a backdrop that's already the correct, smaller size -- the sticky header
// stays inside that same visible area throughout, never pushed off top.
function syncSheetToViewport(backdrop) {
  if (!backdrop || !window.visualViewport) return;
  const vv = window.visualViewport;
  backdrop.style.height = vv.height + "px";
  backdrop.style.top = vv.offsetTop + "px";
  const sheet = backdrop.querySelector(".filter-sheet");
  // 0.8 matches styles.css's own default 80vh -- when the keyboard is
  // closed, vv.height already equals the layout viewport's height, so this
  // computes the same max-height the plain CSS rule would; it only differs
  // (shrinks further) once vv.height itself has shrunk for the keyboard.
  if (sheet) sheet.style.maxHeight = Math.round(vv.height * 0.8) + "px";
}
if (typeof window !== "undefined" && window.visualViewport) {
  const syncOpenSheet = () => syncSheetToViewport(document.querySelector(".filter-sheet-backdrop:not([hidden])"));
  window.visualViewport.addEventListener("resize", syncOpenSheet);
  window.visualViewport.addEventListener("scroll", syncOpenSheet);
}
// Shared focus trap (and, see above, scroll lock) for the app's dialog/sheet
// overlays (Transactions' and Insights' Filters sheets, the Add/Edit bottom
// sheet, Settings' Manage/Export sheets, the Import sheet) -- keeps
// Tab/Shift+Tab cycling within the open sheet instead of leaking focus into
// the page content it's covering. `getContainer` is a function, not an
// element, because some of these sheets fully replace their own inner HTML
// while still open (e.g. insights.js's renderBreakdownFilterSheet on every
// field change) -- looking the container up fresh on every keydown, the same
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
    // Call once, right after the sheet becomes visible in the DOM. Locks
    // background scroll, saves whatever had focus (the button that opened
    // the sheet) so it can be restored on deactivate(), then moves focus to
    // the first focusable element inside the sheet -- in every one of this
    // app's sheets that's the grabber handle or close/cancel button, since
    // it's the first thing in DOM order, so no separate fallback branch is
    // needed.
    activate() {
      lockPageScroll();
      previouslyFocused = document.activeElement;
      const container = getContainer();
      if (!container) return;
      syncSheetToViewport(container.closest(".filter-sheet-backdrop"));
      const first = trapFocusableElements(container)[0];
      if (first) first.focus();
    },
    // Call once, right when the sheet closes (Escape, close button,
    // backdrop tap -- every dismissal path already converges on one
    // close*Sheet() function per sheet, so this only needs one call site).
    deactivate() {
      unlockPageScroll();
      if (previouslyFocused && document.body.contains(previouslyFocused)) previouslyFocused.focus();
      previouslyFocused = null;
    }
  };
}
// A drag handle at the top of every bottom sheet (styles.css's
// .sheet-grabber), visually signaling the sheet is draggable/dismissable --
// Mobbin's own bottom-sheet glossary lists this as the standard affordance,
// alongside or instead of a close button. Paired with wireSheetDrag() below,
// it's also the actual drag target for a real swipe-down-to-dismiss gesture.
// Deliberately its own small element rather than making the whole header
// row draggable: starting a drag from a Cancel/Save/close button would
// otherwise have to be carefully distinguished from a plain click on it.
export function sheetGrabberHtml() {
  return '<div class="sheet-grabber" aria-hidden="true"></div>';
}
const SHEET_DISMISS_DISTANCE = 120; // px dragged down before releasing dismisses the sheet
const SHEET_DISMISS_VELOCITY = 0.5; // px/ms -- a fast-enough flick dismisses even short of the distance above
// Swipe-down-to-dismiss for a bottom sheet, wired to its grabber handle
// (sheetGrabberHtml() above). Mirrors tx-row.js's swipe mechanics --
// pointer capture, a rubber-band clamp against dragging past the resting
// position, a distance-or-velocity decision on release -- adapted from that
// file's horizontal reveal to one vertical dismiss gesture. `onDismiss` is
// each sheet's own existing dismiss()/close*Sheet() function; a drag that
// doesn't clear the threshold animates back to resting instead.
export function wireSheetDrag(handle, sheetEl, onDismiss) {
  let dragging = false, startY = 0, startTime = 0;
  handle.addEventListener("pointerdown", (e) => {
    dragging = true;
    startY = e.clientY;
    startTime = performance.now();
    sheetEl.classList.remove("snap-back");
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const delta = e.clientY - startY;
    const clamped = delta < 0 ? -Math.sqrt(-delta) * 2 : delta;
    sheetEl.style.transform = `translateY(${clamped}px)`;
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    const delta = (e.clientY ?? startY) - startY;
    const elapsed = Math.max(1, performance.now() - startTime);
    const velocity = delta / elapsed;
    if (delta > SHEET_DISMISS_DISTANCE || (delta > 20 && velocity > SHEET_DISMISS_VELOCITY)) {
      onDismiss();
      return;
    }
    sheetEl.classList.add("snap-back");
    sheetEl.style.transform = "";
    sheetEl.addEventListener("transitionend", function onEnd() {
      sheetEl.classList.remove("snap-back");
      sheetEl.removeEventListener("transitionend", onEnd);
    }, { once: true });
  }
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
}
