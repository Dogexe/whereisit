import test from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state.js";
import { dateLabel, parseDateText, displayYear, gregorianYearFromDisplay } from "../src/utils.js";

// dateLabel (display) and parseDateText (typed-input parsing) are meant to
// be exact inverses of each other, in whichever language is active --
// formatting a date then parsing what was formatted must always return
// the original ISO date, since that's the single round trip the Add
// screen's date field actually depends on (prefill via dateLabel, commit
// via parseDateText).
function roundTrip(iso) { return parseDateText(dateLabel(iso)); }

test("displayYear/gregorianYearFromDisplay: English UI is Gregorian, unchanged", () => {
  state.lang = "en";
  assert.equal(displayYear(2026), 2026);
  assert.equal(gregorianYearFromDisplay(2026), 2026);
});

test("displayYear/gregorianYearFromDisplay: Thai UI is Buddhist Era (+543)", () => {
  state.lang = "th";
  assert.equal(displayYear(2026), 2569);
  assert.equal(gregorianYearFromDisplay(2569), 2026);
});

test("dateLabel: shows a Gregorian year in English", () => {
  state.lang = "en";
  assert.equal(dateLabel("2026-08-28"), "28/08/2026");
});

test("dateLabel: shows a Buddhist Era year in Thai", () => {
  state.lang = "th";
  assert.equal(dateLabel("2026-08-28"), "28/08/2569");
});

test("parseDateText: accepts a Gregorian year in English", () => {
  state.lang = "en";
  assert.equal(parseDateText("28/08/2026"), "2026-08-28");
});

test("parseDateText: accepts a Buddhist Era year in Thai (not a Gregorian one)", () => {
  state.lang = "th";
  assert.equal(parseDateText("28/08/2569"), "2026-08-28");
});

test("format then parse round-trips to the original ISO date, in English", () => {
  state.lang = "en";
  assert.equal(roundTrip("2026-08-28"), "2026-08-28");
});

test("format then parse round-trips to the original ISO date, in Thai", () => {
  state.lang = "th";
  assert.equal(roundTrip("2026-08-28"), "2026-08-28");
});

test("format then parse round-trips a leap day, in English", () => {
  state.lang = "en";
  assert.equal(roundTrip("2028-02-29"), "2028-02-29");
});

test("format then parse round-trips a leap day, in Thai", () => {
  state.lang = "th";
  assert.equal(roundTrip("2028-02-29"), "2028-02-29");
});

test("parseDateText: still rejects an invalid date (Feb 30) in either language", () => {
  state.lang = "en";
  assert.equal(parseDateText("30/02/2026"), null);
  state.lang = "th";
  assert.equal(parseDateText("30/02/2569"), null);
});
