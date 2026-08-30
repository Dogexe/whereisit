// Pure CSV-import logic (docs/specs/csv-import.md), extracted the same way
// merge.js/pending.js/watermark.js were: no imports from state.js/sync.js
// or categories.js, everything the caller already owns (existing
// transactions to dedupe against, how to resolve a category) is passed in.
// screens/import-sheet.js is the only thing that wires this to the real
// app -- these functions are unit-tested standalone in tests/import.test.js.

export const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"];

// RFC4180-ish: handles quoted fields (including embedded commas and
// newlines), doubled-quote ("") escaping inside a quoted field, both \n and
// \r\n line endings, and strips a leading UTF-8 BOM -- this app's own CSV
// export (settings.js's exportCsvBtn handler) writes one, so re-importing
// whereisit's own export file must not choke on it. A trailing blank line
// (a lone empty string after the final real row) is dropped rather than
// surfacing as a phantom all-blank row. The header row is NOT treated
// specially here -- every caller in this app always treats row 0 as headers
// per the spec's decision 6, but that's a caller-level assumption, not
// something this generic parser should hardcode.
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = "", inQuotes = false;
  let i = 0;
  const len = text.length;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { pushField(); i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { pushRow(); i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length > 0) pushRow();
  // Drop a trailing all-blank row (a final newline in the file produces
  // one, since the loop above always pushes whatever's pending at EOF).
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") rows.pop();
  const [headers, ...dataRows] = rows.length ? rows : [[]];
  return { headers: headers || [], rows: dataRows };
}

// Strips whitespace and common currency symbols/thousands separators, keeps
// an optional leading "-". Returns null (not 0) for anything that isn't a
// clean number after stripping, and null for exactly 0 -- a real
// transaction amount is always > 0 elsewhere in this app (add.js's own
// submit validation rejects amount <= 0), so an imported "0.00" row is
// exactly as invalid, not a legitimate zero-amount transaction.
export function parseAmountValue(raw) {
  if (raw == null) return null;
  const stripped = String(raw).trim().replace(/[฿$€£]/g, "").replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(stripped)) return null;
  const n = parseFloat(stripped);
  if (isNaN(n) || n === 0) return null;
  return n;
}

// Validates the real calendar date (rejects e.g. day 30 in a month with 29
// days) the same way utils.js's parseDateText already does for the app's
// own date field, rather than just pattern-matching digits.
export function parseDateWithFormat(raw, format) {
  if (raw == null) return null;
  const text = String(raw).trim();
  let d, mo, y;
  if (format === "YYYY-MM-DD") {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
    if (!m) return null;
    y = parseInt(m[1], 10); mo = parseInt(m[2], 10); d = parseInt(m[3], 10);
  } else if (format === "DD/MM/YYYY") {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (!m) return null;
    d = parseInt(m[1], 10); mo = parseInt(m[2], 10); y = parseInt(m[3], 10);
  } else if (format === "MM/DD/YYYY") {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (!m) return null;
    mo = parseInt(m[1], 10); d = parseInt(m[2], 10); y = parseInt(m[3], 10);
  } else {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const iso = String(y).padStart(4, "0") + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  const dt = new Date(iso + "T00:00:00");
  if (isNaN(dt.getTime()) || dt.getDate() !== d || dt.getMonth() + 1 !== mo || dt.getFullYear() !== y) return null;
  return iso;
}

const AMOUNT_EPSILON = 0.005;
// existingTx is already filtered by the caller to just the target account's
// own transactions (docs/specs/csv-import.md decision 2 -- this function
// has no concept of accounts at all, so the per-account dedupe scope is
// entirely the caller's doing, not something to replicate here).
function isDuplicate(date, amount, note, existingTx) {
  return existingTx.some((t) =>
    t.date === date &&
    Math.abs(Math.abs(t.amount) - amount) < AMOUNT_EPSILON &&
    (t.note || "").trim() === note
  );
}

// mapping: { dateCol, amountCol, noteCol: number|null, categoryCol: number|null, dateFormat }
// resolveCategory(rawCategoryText, note, type) -> { categoryId, category } is
// supplied by the caller so this module never imports categories.js
// directly -- the real caller wires it to findCategoryId/guessCategory; a
// test wires it to a stub.
export function buildImportPlan({ dataRows, mapping, existingTx, resolveCategory }) {
  let duplicateCount = 0, unreadableCount = 0;
  const newRows = [];
  (dataRows || []).forEach((row) => {
    const date = parseDateWithFormat(row[mapping.dateCol], mapping.dateFormat);
    const rawAmount = parseAmountValue(row[mapping.amountCol]);
    if (!date || rawAmount == null) { unreadableCount++; return; }
    const type = rawAmount < 0 ? "expense" : "income";
    const amount = Math.abs(rawAmount);
    const note = mapping.noteCol != null ? (row[mapping.noteCol] || "").trim() : "";
    if (isDuplicate(date, amount, note, existingTx || [])) { duplicateCount++; return; }
    const rawCategory = mapping.categoryCol != null ? (row[mapping.categoryCol] || "").trim() : "";
    const { categoryId, category } = resolveCategory(rawCategory, note, type);
    newRows.push({ date, type, amount, note, categoryId, category });
  });
  return { newRows, newCount: newRows.length, duplicateCount, unreadableCount };
}
