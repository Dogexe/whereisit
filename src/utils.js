import { state } from "./state.js";

export const $ = (id) => document.getElementById(id);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export function icon(name, attrs) { return `<i class="icon" data-lucide="${name}"${attrs ? " " + attrs : ""}></i>`; }
export function iconAvatar(name, bg, color, sizeClass, iconAttrs) {
  return `<div class="icon-avatar${sizeClass ? " " + sizeClass : ""}" style="background:${bg};color:${color}">${icon(name, iconAttrs)}</div>`;
}
export const EDIT_ICON = icon("pencil");
export const DELETE_ICON = icon("trash-2");
export const PLUS_ICON = icon("plus");
export function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }
// Builds <option> tags for a plain list of value strings. `labelFn` maps a
// value to display text (defaults to the value itself); pass null as
// `selected` when nothing should be pre-selected.
export function optionsHtml(values, selected, labelFn) {
  return values.map((v) => `<option value="${escapeHtml(v)}"${v === selected ? " selected" : ""}>${escapeHtml(labelFn ? labelFn(v) : v)}</option>`).join("");
}
