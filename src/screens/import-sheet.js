// docs/specs/csv-import.md: the Import bottom sheet, a leaf module rather
// than living inline in settings.js the way the three-button Export sheet
// does (exportSheetHtml/wireExportSheet) -- Import is a real multi-step
// flow (pick file -> map columns -> review counts -> commit) with its own
// internal state, not one click on a static button. settings.js imports
// and calls into this module at exactly the point the Export button/sheet
// already sit.
import { L } from "../i18n.js";
import { state, transactions, categories, accounts } from "../state.js";
import { $, uid, icon, escapeHtml, createFocusTrap, refreshIcons, optionsHtml } from "../utils.js";
import { findCategoryId, guessCategory, categoryDisplayName } from "../categories.js";
import { defaultAccountId } from "../derived.js";
import { saveToStorage } from "../storage.js";
import { pushRows, txToRow, syncNow } from "../sync.js";
import { showToast } from "../toast.js";
import { renderScreen } from "./router.js";
import { renderImportAccountChips } from "./add.js";
import { parseCsv, parseAmountValue, parseDateWithFormat, buildImportPlan, DATE_FORMATS } from "../import.js";

// Parsed file contents and the computed import plan are deliberately NOT on
// the shared `state` object -- see docs/specs/csv-import.md's own decision.
// A parsed CSV can be thousands of rows; state has no precedent for
// holding bulk data like this, and storage.js's saveSettings() explicitly
// enumerates what it persists, so keeping this out of state entirely
// avoids ever needing to reason about it against that enumeration.
let parsedFile = null; // { headers: string[], rows: string[][] } | null
let importPlan = null; // buildImportPlan()'s result, set once the summary step is reached

function resetImportState() {
  parsedFile = null;
  importPlan = null;
  state.importStep = "pick";
  state.importMapping = { dateCol: null, amountCol: null, noteCol: null, categoryCol: null, dateFormat: "YYYY-MM-DD" };
  state.importAccountId = defaultAccountId();
}

export function openImportSheet() {
  resetImportState();
  state.importSheetOpen = true;
  const backdrop = document.getElementById("importSheetBackdrop");
  if (backdrop) backdrop.hidden = false;
  renderImportStepBody();
  importSheetFocusTrap.activate();
}
// Looked up fresh from the DOM rather than closed over at wire-time, same
// reasoning as settings.js's closeExportSheet/transactions.js's closeTxFilterSheet.
export function closeImportSheet() {
  state.importSheetOpen = false;
  const backdrop = document.getElementById("importSheetBackdrop");
  if (backdrop) backdrop.hidden = true;
  importSheetFocusTrap.deactivate();
}
// Registered once at module load, not per-render -- same reasoning as
// settings.js's own Escape listener for the Export sheet.
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.importSheetOpen) closeImportSheet(); });
const importSheetFocusTrap = createFocusTrap(() => {
  const backdrop = document.getElementById("importSheetBackdrop");
  return backdrop && !backdrop.hidden ? backdrop.querySelector(".filter-sheet") : null;
});

export function importSheetHtml() {
  const l = L();
  return `
    <div class="filter-sheet-backdrop" id="importSheetBackdrop" ${state.importSheetOpen ? "" : "hidden"}>
      <div class="filter-sheet" role="dialog" aria-label="${escapeHtml(l.importBtn)}">
        <div class="filter-sheet-header">
          <h3>${escapeHtml(l.importBtn)}</h3>
          <button type="button" class="filter-sheet-close-btn" id="importSheetClose" aria-label="${escapeHtml(l.closeAria)}">&times;</button>
        </div>
        <div id="importSheetBody"></div>
      </div>
    </div>`;
}
// Called once per renderSettings() (settings.js), same shape as wireExportSheet.
export function wireImportSheet() {
  const backdrop = document.getElementById("importSheetBackdrop");
  const openBtn = document.getElementById("openImportSheetBtn");
  const closeBtn = document.getElementById("importSheetClose");
  openBtn.addEventListener("click", openImportSheet);
  closeBtn.addEventListener("click", closeImportSheet);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeImportSheet(); });
  renderImportStepBody();
}

// Swaps only #importSheetBody's innerHTML, not the whole sheet -- paging
// through the wizard's steps never touches the header/close button, same
// "pure DOM toggling, no full re-render" approach Settings' own desktop
// list-detail panel switch already uses.
function renderImportStepBody() {
  const body = document.getElementById("importSheetBody");
  if (!body) return;
  if (state.importStep === "pick") body.innerHTML = pickStepHtml();
  else if (state.importStep === "map") body.innerHTML = mapStepHtml();
  else body.innerHTML = summaryStepHtml();
  wireCurrentStep();
  refreshIcons();
}

function pickStepHtml() {
  const l = L();
  return `
    <div class="import-step">
      <p class="empty-note" style="padding:4px 4px 14px;text-align:left">${escapeHtml(l.importPickFileLabel)}</p>
      <label class="btn btn-secondary btn-block" for="importFileInput" style="cursor:pointer;">
        ${icon("upload")}
        <span>${escapeHtml(l.importChooseFileBtn)}</span>
      </label>
      <input type="file" id="importFileInput" accept=".csv,text/csv" hidden>
    </div>`;
}

function columnSelectHtml(id, dataKey, label, includeNone) {
  const l = L();
  const headers = parsedFile.headers;
  const current = state.importMapping[dataKey];
  const opts = headers.map((h, idx) => `<option value="${idx}"${current === idx ? " selected" : ""}>${escapeHtml(h || ("Column " + (idx + 1)))}</option>`).join("");
  const noneOpt = includeNone ? `<option value=""${current == null ? " selected" : ""}>${escapeHtml(l.importNoColumnOption)}</option>` : `<option value="" disabled${current == null ? " selected" : ""}>${escapeHtml(l.importNoColumnOption)}</option>`;
  return `
    <div class="field">
      <label for="${id}">${escapeHtml(label)}</label>
      <select class="input" id="${id}" data-import-map="${dataKey}">${noneOpt}${opts}</select>
    </div>`;
}

function mapStepHtml() {
  const l = L();
  return `
    <div class="import-step">
      ${columnSelectHtml("importColDate", "dateCol", l.importDateColumnLabel, false)}
      <div class="field">
        <label for="importDateFormat">${escapeHtml(l.importDateFormatLabel)}</label>
        <select class="input" id="importDateFormat">
          ${DATE_FORMATS.map((f) => `<option value="${f}"${state.importMapping.dateFormat === f ? " selected" : ""}>${f}</option>`).join("")}
        </select>
      </div>
      ${columnSelectHtml("importColAmount", "amountCol", l.importAmountColumnLabel, false)}
      ${columnSelectHtml("importColNote", "noteCol", l.importNoteColumnLabel, true)}
      ${columnSelectHtml("importColCategory", "categoryCol", l.importCategoryColumnLabel, true)}
      <div class="field">
        <label>${escapeHtml(l.accountLabel)}</label>
        <div class="account-chip-row" id="importAccountChipRow"></div>
        <select class="input account-select-collapsed" id="importAccount" required></select>
      </div>
      <div id="importPreviewArea"></div>
      <div class="import-step-actions">
        <button type="button" class="btn btn-secondary" id="importBackBtn">${escapeHtml(l.importBackBtn)}</button>
        <button type="button" class="btn btn-primary" id="importContinueBtn">${escapeHtml(l.importContinueBtn)}</button>
      </div>
    </div>`;
}

function renderImportAccountOptions() {
  const select = $("importAccount");
  const opts = accounts.filter((a) => !a.archived || a.id === state.importAccountId);
  select.innerHTML = optionsHtml(opts.map((a) => a.id), state.importAccountId, (id) => {
    const a = accounts.find((x) => x.id === id);
    return a ? a.name : id;
  });
}

function updatePreview() {
  const area = document.getElementById("importPreviewArea");
  if (!area) return;
  const l = L();
  const m = state.importMapping;
  if (m.dateCol == null || m.amountCol == null || !parsedFile) { area.innerHTML = ""; return; }
  const sampleRows = parsedFile.rows.slice(0, 5);
  if (!sampleRows.length) { area.innerHTML = ""; return; }
  const rowsHtml = sampleRows.map((row) => {
    const date = parseDateWithFormat(row[m.dateCol], m.dateFormat);
    const amt = parseAmountValue(row[m.amountCol]);
    const ok = date && amt != null;
    const text = ok ? `${date} · ${amt < 0 ? "-" : "+"}${Math.abs(amt)}` : "—";
    return `<div class="import-preview-row${ok ? "" : " import-preview-row-bad"}">${escapeHtml(text)}</div>`;
  }).join("");
  area.innerHTML = `<div class="field"><label>${escapeHtml(l.importPreviewLabel)}</label>${rowsHtml}</div>`;
}

function summaryStepHtml() {
  const l = L();
  const summary = l.importSummaryLine
    .replace("{new}", importPlan.newCount)
    .replace("{dup}", importPlan.duplicateCount)
    .replace("{bad}", importPlan.unreadableCount);
  return `
    <div class="import-step">
      <p class="empty-note" style="padding:4px 4px 14px;text-align:left">${escapeHtml(summary)}</p>
      <div class="import-step-actions">
        <button type="button" class="btn btn-secondary" id="importBackBtn">${escapeHtml(l.importBackBtn)}</button>
        <button type="button" class="btn btn-primary" id="importCommitBtn" ${importPlan.newCount === 0 ? "disabled" : ""}>${escapeHtml(l.importCommitBtn)}</button>
      </div>
    </div>`;
}

async function onFileChosen(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const l = L();
  let text;
  try { text = await file.text(); } catch (err) { showToast(l.toastImportParseError); return; }
  const parsed = parseCsv(text);
  if (!parsed.headers.length || !parsed.rows.length) { showToast(l.toastImportParseError); return; }
  parsedFile = parsed;
  state.importStep = "map";
  renderImportStepBody();
}

function onMappingColumnChange(e) {
  const key = e.target.getAttribute("data-import-map");
  const val = e.target.value;
  state.importMapping[key] = val === "" ? null : Number(val);
  updatePreview();
}

// Reused as the resolveCategory callback buildImportPlan() (src/import.js)
// expects -- wires the real findCategoryId/guessCategory pair, mirroring
// resolveCategoryId's own exact-name-match-then-fallback shape (derived.js)
// rather than inventing new matching logic. See docs/specs/csv-import.md's
// category-resolution decision for why an unmatched name keeps its raw
// text instead of being discarded or auto-creating a category.
function resolveCategory(rawCategory, note, type) {
  if (rawCategory) {
    const categoryId = findCategoryId(categories, rawCategory, type);
    return { categoryId, category: rawCategory };
  }
  const guessedId = guessCategory(note, type);
  return { categoryId: guessedId, category: guessedId ? categoryDisplayName(categories, guessedId, "") : "" };
}

function onContinueFromMap() {
  const l = L();
  const m = state.importMapping;
  if (m.dateCol == null || m.amountCol == null) { showToast(l.toastImportMappingRequired); return; }
  // docs/specs/csv-import.md decision 2: dedupe is scoped to the target
  // account only -- existingTx is filtered here, at the call site, since
  // buildImportPlan() itself has no concept of accounts at all.
  const existingTx = transactions.filter((t) => t.accountId === state.importAccountId && (t.type === "income" || t.type === "expense"));
  importPlan = buildImportPlan({ dataRows: parsedFile.rows, mapping: m, existingTx, resolveCategory });
  state.importStep = "summary";
  renderImportStepBody();
}

// Batched, not per-row -- one saveToStorage() and one pushRows() call for
// the whole import, not the Add form's one-row-at-a-time pattern, which
// would mean up to hundreds of redundant localStorage writes and network
// calls. checkBudgetAlert is deliberately never called here (see the spec's
// own decision) -- it exists for a live single-transaction add, and firing
// it per-row across a bulk historical backfill would be meaningless noise.
function commitImport() {
  const accountId = state.importAccountId;
  const newTxs = importPlan.newRows.map((r) => ({
    id: uid(), type: r.type, date: r.date, category: r.category, categoryId: r.categoryId,
    accountId, amount: r.amount, note: r.note, updatedAt: Date.now(),
  }));
  newTxs.forEach((t) => transactions.push(t));
  saveToStorage();
  const l = L();
  showToast(l.toastImportSuccess.replace("{n}", newTxs.length));
  closeImportSheet();
  renderScreen();
  pushRows("transactions", newTxs.map((t) => txToRow(t, false))).then(() => syncNow());
}

function wireCurrentStep() {
  if (state.importStep === "pick") {
    document.getElementById("importFileInput").addEventListener("change", onFileChosen);
    return;
  }
  if (state.importStep === "map") {
    renderImportAccountOptions();
    renderImportAccountChips();
    document.querySelectorAll("[data-import-map]").forEach((sel) => sel.addEventListener("change", onMappingColumnChange));
    document.getElementById("importDateFormat").addEventListener("change", (e) => { state.importMapping.dateFormat = e.target.value; updatePreview(); });
    document.getElementById("importAccount").addEventListener("change", (e) => { state.importAccountId = e.target.value; });
    document.getElementById("importBackBtn").addEventListener("click", () => { state.importStep = "pick"; renderImportStepBody(); });
    document.getElementById("importContinueBtn").addEventListener("click", onContinueFromMap);
    updatePreview();
    return;
  }
  // summary step
  document.getElementById("importBackBtn").addEventListener("click", () => { state.importStep = "map"; renderImportStepBody(); });
  const commitBtn = document.getElementById("importCommitBtn");
  if (commitBtn) commitBtn.addEventListener("click", commitImport);
}
