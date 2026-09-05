// Settings' Export sheet (CSV/JSON/Google Sheets), split out of
// settings.js (see that file's own header comment for why) -- mirrors
// import-sheet.js's shape (a self-contained sheet module wired once per
// renderSettings() call) now that its own three button handlers, formerly
// inline in settings.js's wiring pass, live alongside the sheet they
// belong to.
import { L } from "../i18n.js";
import { state, transactions } from "../state.js";
import { $, escapeHtml, iconAvatar, createFocusTrap, sheetGrabberHtml, wireSheetDrag } from "../utils.js";
import { showToast } from "../toast.js";
import { exportToGoogleSheets } from "../sheets-export.js";

// The three export options (CSV/JSON/Google Sheets) used to be three
// always-visible toggle-rows; now they're one "Export" row that opens a
// bottom sheet, copying Transactions' filter-sheet structure exactly
// (.filter-sheet-backdrop/.filter-sheet, createFocusTrap, Escape-to-close,
// role="dialog") rather than inventing a second sheet mechanism.
export function exportSheetHtml() {
  const l = L();
  return `
    <div class="filter-sheet-backdrop" id="exportSheetBackdrop" ${state.exportSheetOpen ? "" : "hidden"}>
      <div class="filter-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(l.exportBtn)}">
        <div class="filter-sheet-header">
          ${sheetGrabberHtml()}
          <h3>${escapeHtml(l.exportBtn)}</h3>
          <button type="button" class="filter-sheet-close-btn" id="exportSheetClose" aria-label="${escapeHtml(l.closeAria)}">&times;</button>
        </div>
        <div class="sheet-body">
          <button type="button" class="toggle-row" id="exportCsvBtn">
            ${iconAvatar("download", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
            <span class="label">${escapeHtml(l.exportCsvBtn)}</span>
          </button>
          <button type="button" class="toggle-row" id="exportJsonBtn">
            ${iconAvatar("download", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
            <span class="label">${escapeHtml(l.exportJsonBtn)}</span>
          </button>
          <button type="button" class="toggle-row" id="exportSheetsBtn">
            ${iconAvatar("table", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
            <span class="label">${escapeHtml(l.exportSheetsBtn)}</span>
          </button>
        </div>
      </div>
    </div>`;
}
// Looked up fresh from the DOM rather than closed over at wire-time, same
// reasoning as transactions.js's closeTxFilterSheet.
function closeExportSheet() {
  state.exportSheetOpen = false;
  const backdrop = document.getElementById("exportSheetBackdrop");
  if (backdrop) backdrop.hidden = true;
  exportSheetFocusTrap.deactivate();
}
// Registered once at module load, not per-render -- renderSettings() runs
// on every navigation to this tab, and a per-render document-level
// listener would pile up indefinitely since nothing ever removes it.
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.exportSheetOpen) closeExportSheet(); });
const exportSheetFocusTrap = createFocusTrap(() => {
  const backdrop = document.getElementById("exportSheetBackdrop");
  return backdrop && !backdrop.hidden ? backdrop.querySelector(".filter-sheet") : null;
});
// Called once per renderSettings() (settings.js), same shape as
// wireImportSheet -- absorbs the CSV/JSON/Sheets button handlers, which
// used to be wired separately at the bottom of settings.js's own wiring
// pass, purely because that's where this sheet's markup used to live too.
export function wireExportSheet() {
  const backdrop = document.getElementById("exportSheetBackdrop");
  const openBtn = document.getElementById("openExportSheetBtn");
  const closeBtn = document.getElementById("exportSheetClose");
  openBtn.addEventListener("click", () => { state.exportSheetOpen = true; backdrop.hidden = false; exportSheetFocusTrap.activate(); });
  closeBtn.addEventListener("click", closeExportSheet);
  wireSheetDrag(backdrop.querySelector(".sheet-grabber"), backdrop.querySelector(".filter-sheet"), closeExportSheet);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeExportSheet(); });
  $("exportCsvBtn").addEventListener("click", function () {
    const l = L();
    const header = [l.csvDate, l.csvType, l.csvCategory, l.csvNote, l.csvAmount];
    const rows = transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).map((t) =>
      [t.date, t.type === "income" ? L().incomeLabel : L().expenseLabel, t.category, t.note || "", t.amount].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(","));
    const blob = new Blob(["﻿" + header.join(",") + "\n" + rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "transactions.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    showToast(L().toastCsv);
    closeExportSheet();
  });
  $("exportJsonBtn").addEventListener("click", function () {
    const blob = new Blob([JSON.stringify(transactions, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "transactions.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    showToast(L().toastJson);
    closeExportSheet();
  });
  $("exportSheetsBtn").addEventListener("click", function () {
    exportToGoogleSheets();
    closeExportSheet();
  });
}
