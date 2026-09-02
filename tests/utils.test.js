import test from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state.js";
import { dateLabel, parseDateText, displayYear, gregorianYearFromDisplay, localDateIso, localMonthKey, localIsoFromDate, monthKeyOf, fmtMoney } from "../src/utils.js";

// localDateIso/localMonthKey/monthKeyOf read the wall clock (or a supplied
// Date object) via local getters (getFullYear/getMonth/getDate), not
// .toISOString(), specifically so a user east of UTC (e.g. Bangkok, UTC+7)
// sees their own local "today," not UTC's. node:test's mock timers pin the
// underlying instant; process.env.TZ controls which timezone Date's local
// getters resolve against for that instant -- both are needed to actually
// exercise the bug this guards against (CI runs in UTC, where the bug is
// invisible, so the test must force a non-UTC, UTC-ahead timezone).
function withFakeNowInTZ(t, utcIsoDateTime, tz, fn) {
  const originalTZ = process.env.TZ;
  process.env.TZ = tz;
  t.mock.timers.enable({ apis: ["Date"], now: new Date(utcIsoDateTime).getTime() });
  try { fn(); } finally { t.mock.timers.reset(); process.env.TZ = originalTZ; }
}

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

// --- timezone bug regression coverage ---

test("localDateIso/localMonthKey: return the LOCAL date/month in a UTC-ahead timezone, not UTC's (which is still the previous day/month)", (t) => {
  // 2026-08-31T19:00:00Z is already 2026-09-01 02:00 in Bangkok (UTC+7) --
  // a new month locally, while UTC (and therefore .toISOString()) still
  // reads 2026-08-31. This is exactly the window (local midnight to 7am
  // Bangkok time) where the bug this guards against would show yesterday.
  withFakeNowInTZ(t, "2026-08-31T19:00:00Z", "Asia/Bangkok", () => {
    assert.equal(localDateIso(), "2026-09-01");
    assert.equal(localMonthKey(), "2026-09");
  });
});

test("localDateIso: reads correctly at exactly local midnight in a UTC-ahead timezone", (t) => {
  // 2026-08-31T17:00:00Z is 2026-09-01 00:00:00 in Bangkok -- the exact
  // instant local midnight rolls over, still 2026-08-31 in UTC.
  withFakeNowInTZ(t, "2026-08-31T17:00:00Z", "Asia/Bangkok", () => {
    assert.equal(localDateIso(), "2026-09-01");
  });
});

test("localIsoFromDate/monthKeyOf: convert an explicit Date object using local (not UTC) getters", (t) => {
  withFakeNowInTZ(t, "2026-01-01T00:00:00Z", "Asia/Bangkok", () => {
    const d = new Date("2026-08-31T19:00:00Z");
    assert.equal(localIsoFromDate(d), "2026-09-01");
    assert.equal(monthKeyOf(d), "2026-09");
  });
});

test("localDateIso/localMonthKey: a UTC-behind timezone (e.g. New York) is unaffected -- same instant, no rollover there", (t) => {
  withFakeNowInTZ(t, "2026-08-31T19:00:00Z", "America/New_York", () => {
    assert.equal(localDateIso(), "2026-08-31");
    assert.equal(localMonthKey(), "2026-08");
  });
});

test("fmtMoney: renders the real formatted amount when hideAmounts is off", () => {
  const original = state.hideAmounts;
  state.hideAmounts = false;
  try {
    assert.equal(fmtMoney(1234.5), "฿1,234.50");
  } finally { state.hideAmounts = original; }
});

test("fmtMoney: renders a fixed masked placeholder when hideAmounts is on, regardless of the real value", () => {
  const original = state.hideAmounts;
  state.hideAmounts = true;
  try {
    assert.equal(fmtMoney(1234.5), "฿•••••");
    assert.equal(fmtMoney(0), "฿•••••");
    assert.equal(fmtMoney(-99999), "฿•••••");
  } finally { state.hideAmounts = original; }
});
