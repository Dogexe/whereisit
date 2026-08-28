import test from "node:test";
import assert from "node:assert/strict";
import { state, setBills, setTransactions } from "../src/state.js";
import {
  nextBillDueDate, daysUntilBillDue, billDueCycle, dueSoonLabel, upcomingBills, monthKeyOf,
  pctDeltaLabel, monthHasTransactions
} from "../src/derived.js";

// derived.js's bill-due functions read the wall clock via `new Date()`
// directly (no injectable clock) -- node:test's mock timers let these
// tests pin "now" to an exact instant instead of depending on whatever day
// it happens to be run on, or hitting month-boundary edge cases (e.g. "one
// day past due" computed from the real today would break on the 1st of
// any month).
function withFakeNow(t, isoDateTime, fn) {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(isoDateTime).getTime() });
  try { fn(); } finally { t.mock.timers.reset(); }
}

test("nextBillDueDate/daysUntilBillDue: unpaid bill one day past due -> negative daysUntil", (t) => {
  withFakeNow(t, "2026-03-15T12:00:00", () => {
    const bill = { day: 14, lastPaidCycle: null };
    assert.equal(daysUntilBillDue(bill), -1);
    const due = nextBillDueDate(bill);
    assert.equal(monthKeyOf(due), "2026-03");
    assert.equal(due.getDate(), 14);
  });
});

test("nextBillDueDate/daysUntilBillDue: same bill marked paid for this cycle -> rolls to next cycle", (t) => {
  withFakeNow(t, "2026-03-15T12:00:00", () => {
    const bill = { day: 14, lastPaidCycle: "2026-03" };
    const due = nextBillDueDate(bill);
    assert.equal(monthKeyOf(due), "2026-04");
    assert.equal(due.getDate(), 14);
    assert.ok(daysUntilBillDue(bill) > 0, "a paid, rolled-forward bill must not read as overdue");
  });
});

test("nextBillDueDate: a bill due on the 31st in February still clamps to the 28th (non-leap year)", (t) => {
  // 2026 is not a leap year (not divisible by 4).
  withFakeNow(t, "2026-02-10T12:00:00", () => {
    const bill = { day: 31, lastPaidCycle: null };
    const due = nextBillDueDate(bill);
    assert.equal(monthKeyOf(due), "2026-02");
    assert.equal(due.getDate(), 28);
  });
});

test("nextBillDueDate: a bill due on the 31st in February clamps to the 29th in a leap year", (t) => {
  withFakeNow(t, "2028-02-10T12:00:00", () => {
    const bill = { day: 31, lastPaidCycle: null };
    const due = nextBillDueDate(bill);
    assert.equal(monthKeyOf(due), "2028-02");
    assert.equal(due.getDate(), 29);
  });
});

test("billDueCycle: matches the month of whatever nextBillDueDate returns", (t) => {
  withFakeNow(t, "2026-03-15T12:00:00", () => {
    assert.equal(billDueCycle({ day: 14, lastPaidCycle: null }), "2026-03");
    assert.equal(billDueCycle({ day: 14, lastPaidCycle: "2026-03" }), "2026-04");
  });
});

test("dueSoonLabel: overdue by 1 day uses the singular string, not '1 days'", () => {
  state.lang = "en";
  assert.equal(dueSoonLabel(-1), "Overdue by 1 day");
});

test("dueSoonLabel: overdue by multiple days", () => {
  state.lang = "en";
  assert.equal(dueSoonLabel(-5), "Overdue by 5 days");
});

test("dueSoonLabel: today/tomorrow/N days ahead are unaffected by the overdue change", () => {
  state.lang = "en";
  assert.equal(dueSoonLabel(0), "Due today");
  assert.equal(dueSoonLabel(1), "Due tomorrow");
  assert.equal(dueSoonLabel(5), "Due in 5 days");
});

test("upcomingBills: an overdue bill is not excluded by the daysUntil<=7 filter", (t) => {
  withFakeNow(t, "2026-03-15T12:00:00", () => {
    setBills([
      { id: "b1", name: "Overdue rent", day: 14, lastPaidCycle: null, amount: 8000, category: "x" },
      { id: "b2", name: "Far out bill", day: 1, lastPaidCycle: "2026-03", amount: 500, category: "x" }
    ]);
    const result = upcomingBills();
    const ids = result.map((b) => b.id);
    assert.ok(ids.includes("b1"), "overdue bill must still appear in upcomingBills()");
    assert.ok(result.find((b) => b.id === "b1").daysUntil < 0);
    assert.ok(!ids.includes("b2"), "a bill correctly rolled forward to next month, weeks away, should not appear");
  });
});

test("monthHasTransactions: true only when a transaction of that type falls in that month", () => {
  setTransactions([
    { id: "1", type: "income", date: "2026-03-05", amount: 100 },
    { id: "2", type: "expense", date: "2026-04-01", amount: 50 }
  ]);
  assert.equal(monthHasTransactions("2026-03", "income"), true);
  assert.equal(monthHasTransactions("2026-03", "expense"), false, "wrong type in that month");
  assert.equal(monthHasTransactions("2026-02", "income"), false, "no transactions that month at all");
  assert.equal(monthHasTransactions("2026-04"), true, "no type filter matches any type");
});

test("pctDeltaLabel: no prior-period transactions at all -> no badge (null), not +100%", () => {
  assert.equal(pctDeltaLabel(500, 0, false), null);
  assert.equal(pctDeltaLabel(0, 0, false), null);
});

test("pctDeltaLabel: prior period had transactions but summed to exactly 0 -> still null (division by zero)", () => {
  assert.equal(pctDeltaLabel(200, 0, true), null);
});

test("pctDeltaLabel: genuine increase against a real, nonzero prior period", () => {
  assert.equal(pctDeltaLabel(150, 100, true), "+50%");
});

test("pctDeltaLabel: genuine decrease against a real, nonzero prior period", () => {
  assert.equal(pctDeltaLabel(50, 100, true), "-50%");
});
