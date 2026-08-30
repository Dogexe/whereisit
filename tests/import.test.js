import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseAmountValue, parseDateWithFormat, buildImportPlan } from "../src/import.js";

// ---------------------------------------------------------------------
// parseCsv
// ---------------------------------------------------------------------

test("parseCsv: a simple 3-column file", () => {
  const { headers, rows } = parseCsv("Date,Amount,Note\n2026-01-01,100,coffee\n2026-01-02,-50,lunch\n");
  assert.deepEqual(headers, ["Date", "Amount", "Note"]);
  assert.deepEqual(rows, [["2026-01-01", "100", "coffee"], ["2026-01-02", "-50", "lunch"]]);
});

test("parseCsv: a quoted field containing a comma", () => {
  const { rows } = parseCsv('Date,Amount,Note\n2026-01-01,100,"lunch, with tax"\n');
  assert.deepEqual(rows, [["2026-01-01", "100", "lunch, with tax"]]);
});

test("parseCsv: a quoted field containing an embedded newline", () => {
  const { rows } = parseCsv('Date,Amount,Note\n2026-01-01,100,"line1\nline2"\n');
  assert.deepEqual(rows, [["2026-01-01", "100", "line1\nline2"]]);
});

test("parseCsv: doubled-quote escaping inside a quoted field", () => {
  const { rows } = parseCsv('Date,Amount,Note\n2026-01-01,100,"she said ""hi"""\n');
  assert.deepEqual(rows, [["2026-01-01", "100", 'she said "hi"']]);
});

test("parseCsv: CRLF line endings", () => {
  const { headers, rows } = parseCsv("Date,Amount\r\n2026-01-01,100\r\n2026-01-02,200\r\n");
  assert.deepEqual(headers, ["Date", "Amount"]);
  assert.deepEqual(rows, [["2026-01-01", "100"], ["2026-01-02", "200"]]);
});

test("parseCsv: a leading BOM is stripped", () => {
  const { headers } = parseCsv("﻿Date,Amount\n2026-01-01,100\n");
  assert.deepEqual(headers, ["Date", "Amount"]);
});

test("parseCsv: a trailing blank line is ignored, not a phantom row", () => {
  const { rows } = parseCsv("Date,Amount\n2026-01-01,100\n\n");
  assert.equal(rows.length, 1);
});

// ---------------------------------------------------------------------
// parseAmountValue
// ---------------------------------------------------------------------

test("parseAmountValue: a plain integer", () => { assert.equal(parseAmountValue("100"), 100); });
test("parseAmountValue: a decimal", () => { assert.equal(parseAmountValue("99.50"), 99.5); });
test("parseAmountValue: thousands-separator commas", () => { assert.equal(parseAmountValue("1,234.56"), 1234.56); });
test("parseAmountValue: a currency symbol prefix", () => { assert.equal(parseAmountValue("฿1,234.56"), 1234.56); });
test("parseAmountValue: a negative value", () => { assert.equal(parseAmountValue("-50.25"), -50.25); });
test("parseAmountValue: zero returns null", () => { assert.equal(parseAmountValue("0"), null); });
test("parseAmountValue: zero with decimals returns null", () => { assert.equal(parseAmountValue("0.00"), null); });
test("parseAmountValue: empty string returns null", () => { assert.equal(parseAmountValue(""), null); });
test("parseAmountValue: non-numeric garbage returns null", () => { assert.equal(parseAmountValue("N/A"), null); });
test("parseAmountValue: null returns null", () => { assert.equal(parseAmountValue(null), null); });

// ---------------------------------------------------------------------
// parseDateWithFormat
// ---------------------------------------------------------------------

test("parseDateWithFormat: YYYY-MM-DD", () => { assert.equal(parseDateWithFormat("2026-08-31", "YYYY-MM-DD"), "2026-08-31"); });
test("parseDateWithFormat: DD/MM/YYYY", () => { assert.equal(parseDateWithFormat("31/08/2026", "DD/MM/YYYY"), "2026-08-31"); });
test("parseDateWithFormat: MM/DD/YYYY", () => { assert.equal(parseDateWithFormat("08/31/2026", "MM/DD/YYYY"), "2026-08-31"); });
test("parseDateWithFormat: single-digit day/month accepted for slash formats", () => {
  assert.equal(parseDateWithFormat("3/8/2026", "DD/MM/YYYY"), "2026-08-03");
  assert.equal(parseDateWithFormat("8/3/2026", "MM/DD/YYYY"), "2026-08-03");
});
test("parseDateWithFormat: a genuinely invalid calendar date (Feb 30) is rejected in every format", () => {
  assert.equal(parseDateWithFormat("2026-02-30", "YYYY-MM-DD"), null);
  assert.equal(parseDateWithFormat("30/02/2026", "DD/MM/YYYY"), null);
  assert.equal(parseDateWithFormat("02/30/2026", "MM/DD/YYYY"), null);
});
test("parseDateWithFormat: garbage input returns null", () => { assert.equal(parseDateWithFormat("not a date", "YYYY-MM-DD"), null); });
test("parseDateWithFormat: null returns null", () => { assert.equal(parseDateWithFormat(null, "YYYY-MM-DD"), null); });

// ---------------------------------------------------------------------
// buildImportPlan
// ---------------------------------------------------------------------

const stubResolveCategory = (rawCategory) => ({ categoryId: null, category: rawCategory || "" });
const mapping = { dateCol: 0, amountCol: 1, noteCol: 2, categoryCol: 3, dateFormat: "YYYY-MM-DD" };

test("buildImportPlan: a clean file with no existing transactions -- all new", () => {
  const dataRows = [
    ["2026-08-01", "100", "coffee", ""],
    ["2026-08-02", "-50", "lunch", ""],
  ];
  const result = buildImportPlan({ dataRows, mapping, existingTx: [], resolveCategory: stubResolveCategory });
  assert.equal(result.newCount, 2);
  assert.equal(result.duplicateCount, 0);
  assert.equal(result.unreadableCount, 0);
  assert.equal(result.newRows[0].type, "income");
  assert.equal(result.newRows[0].amount, 100);
  assert.equal(result.newRows[1].type, "expense");
  assert.equal(result.newRows[1].amount, 50);
});

test("buildImportPlan: a row exactly matching an existing transaction in the target account is skipped as duplicate", () => {
  const dataRows = [["2026-08-01", "100", "coffee", ""]];
  const existingTx = [{ date: "2026-08-01", amount: 100, note: "coffee" }];
  const result = buildImportPlan({ dataRows, mapping, existingTx, resolveCategory: stubResolveCategory });
  assert.equal(result.newCount, 0);
  assert.equal(result.duplicateCount, 1);
});

test("buildImportPlan: a row matching an existing transaction in a DIFFERENT account is not skipped -- dedupe scope is the caller's job", () => {
  // The caller is responsible for pre-filtering existingTx to the target
  // account (docs/specs/csv-import.md decision 2). Passing an empty
  // existingTx here simulates "this transaction exists, but in a different
  // account, so the caller never included it" -- proves this function
  // itself has no cross-account awareness to accidentally short-circuit.
  const dataRows = [["2026-08-01", "100", "coffee", ""]];
  const result = buildImportPlan({ dataRows, mapping, existingTx: [], resolveCategory: stubResolveCategory });
  assert.equal(result.newCount, 1);
  assert.equal(result.duplicateCount, 0);
});

test("buildImportPlan: two identical rows within the same file both import when neither matches an existing transaction", () => {
  const dataRows = [
    ["2026-08-01", "100", "coffee", ""],
    ["2026-08-01", "100", "coffee", ""],
  ];
  const result = buildImportPlan({ dataRows, mapping, existingTx: [], resolveCategory: stubResolveCategory });
  assert.equal(result.newCount, 2);
  assert.equal(result.duplicateCount, 0);
});

test("buildImportPlan: an unparseable date is counted as unreadable, not silently dropped", () => {
  const dataRows = [["not-a-date", "100", "coffee", ""]];
  const result = buildImportPlan({ dataRows, mapping, existingTx: [], resolveCategory: stubResolveCategory });
  assert.equal(result.newCount, 0);
  assert.equal(result.unreadableCount, 1);
});

test("buildImportPlan: a zero amount is counted as unreadable, not silently dropped", () => {
  const dataRows = [["2026-08-01", "0", "coffee", ""]];
  const result = buildImportPlan({ dataRows, mapping, existingTx: [], resolveCategory: stubResolveCategory });
  assert.equal(result.newCount, 0);
  assert.equal(result.unreadableCount, 1);
});

test("buildImportPlan: a mapped Category column whose text matches a live category resolves the real id", () => {
  const resolveCategory = (rawCategory, note, type) =>
    rawCategory === "Food" && type === "expense" ? { categoryId: "cat-food", category: "Food" } : { categoryId: null, category: rawCategory || "" };
  const dataRows = [["2026-08-01", "-50", "lunch", "Food"]];
  const result = buildImportPlan({ dataRows, mapping, existingTx: [], resolveCategory });
  assert.equal(result.newRows[0].categoryId, "cat-food");
  assert.equal(result.newRows[0].category, "Food");
});

test("buildImportPlan: a mapped Category column whose text matches nothing keeps the raw text with a null id", () => {
  const resolveCategory = (rawCategory) => ({ categoryId: null, category: rawCategory || "" });
  const dataRows = [["2026-08-01", "-50", "lunch", "Some Bank Category"]];
  const result = buildImportPlan({ dataRows, mapping, existingTx: [], resolveCategory });
  assert.equal(result.newRows[0].categoryId, null);
  assert.equal(result.newRows[0].category, "Some Bank Category");
});

test("buildImportPlan: no Category column mapped falls through to the injected resolveCategory (standing in for guessCategory)", () => {
  const noCategoryMapping = { dateCol: 0, amountCol: 1, noteCol: 2, categoryCol: null, dateFormat: "YYYY-MM-DD" };
  let calledWith = null;
  const resolveCategory = (rawCategory, note, type) => {
    calledWith = { rawCategory, note, type };
    return { categoryId: "guessed-id", category: "Guessed" };
  };
  const dataRows = [["2026-08-01", "-50", "taxi fare", "ignored-because-no-category-column"]];
  const result = buildImportPlan({ dataRows, mapping: noCategoryMapping, existingTx: [], resolveCategory });
  assert.equal(calledWith.rawCategory, "");
  assert.equal(calledWith.note, "taxi fare");
  assert.equal(calledWith.type, "expense");
  assert.equal(result.newRows[0].categoryId, "guessed-id");
});
