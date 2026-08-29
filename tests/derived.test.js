import test from "node:test";
import assert from "node:assert/strict";
import { state, setBills, setTransactions, setBudgets, setCategories } from "../src/state.js";
import {
  nextBillDueDate, daysUntilBillDue, billDueCycle, dueSoonLabel, upcomingBills, monthKeyOf,
  pctDeltaLabel, monthHasTransactions, unbudgetedSpend, unbudgetedSpendForYear,
  computeBudgets, checkBudgetAlert, computeBreakdown
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

test("unbudgetedSpend: totals expense transactions in categories with no budget, ignores budgeted ones and other months", () => {
  setBudgets([{ id: "b1", category: "อาหารและเครื่องดื่ม", limit: 3000 }]);
  setTransactions([
    { id: "t1", type: "expense", date: "2026-03-05", category: "อาหารและเครื่องดื่ม", amount: 500 }, // budgeted, excluded
    { id: "t2", type: "expense", date: "2026-03-10", category: "สุขภาพ", amount: 800 }, // unbudgeted
    { id: "t3", type: "expense", date: "2026-03-15", category: "สาธารณูปโภค (ไฟ/น้ำ/เน็ต)", amount: 590 }, // unbudgeted
    { id: "t4", type: "expense", date: "2026-04-01", category: "สุขภาพ", amount: 999 }, // wrong month, excluded
    { id: "t5", type: "income", date: "2026-03-12", category: "สุขภาพ", amount: 5000 } // income, not expense, excluded
  ]);
  assert.equal(unbudgetedSpend("2026-03"), 1390);
});

test("unbudgetedSpend: zero when every expense category has a budget", () => {
  setBudgets([{ id: "b1", category: "สุขภาพ", limit: 1000 }]);
  setTransactions([{ id: "t1", type: "expense", date: "2026-03-05", category: "สุขภาพ", amount: 800 }]);
  assert.equal(unbudgetedSpend("2026-03"), 0);
});

test("unbudgetedSpendForYear: same idea, summed across the whole year", () => {
  setBudgets([{ id: "b1", category: "อาหารและเครื่องดื่ม", limit: 3000 }]);
  setTransactions([
    { id: "t1", type: "expense", date: "2026-01-05", category: "สุขภาพ", amount: 100 },
    { id: "t2", type: "expense", date: "2026-11-20", category: "สุขภาพ", amount: 200 },
    { id: "t3", type: "expense", date: "2025-12-31", category: "สุขภาพ", amount: 999 } // wrong year, excluded
  ]);
  assert.equal(unbudgetedSpendForYear("2026"), 300);
});

// --- categoryId-aware matching (docs/specs/custom-categories.md stage 2) ---
// computeBudgets/checkBudgetAlert/computeBreakdown had no prior test
// coverage at all before this stage's refactor, so these specifically
// exercise the new categoryId-based matching -- including a row that only
// has categoryId set (no .category match needed) and a rename scenario
// (the category's current display name no longer matches what an old
// transaction's .category string says), confirming the whole point of
// this migration: matching survives a rename, and display always reflects
// the *current* name, not a stale stored string.

test("computeBudgets: matches a budget and transaction by categoryId even when their .category strings differ (post-rename)", () => {
  setCategories([{ id: "cat-food", type: "expense", name: "Groceries (renamed)", icon: "utensils" }]);
  setBudgets([{ id: "b1", category: "อาหารและเครื่องดื่ม", categoryId: "cat-food", limit: 1000 }]);
  setTransactions([{ id: "t1", type: "expense", date: "2026-03-05", category: "อาหารและเครื่องดื่ม", categoryId: "cat-food", amount: 400 }]);
  const [result] = computeBudgets("2026-03");
  assert.equal(result.category, "Groceries (renamed)", "display name resolves via categoryId, not the stale .category string");
  assert.equal(result.spentFmt, "฿400.00");
});

test("computeBudgets: falls back to name+type matching when categoryId is missing entirely (pre-backfill row)", () => {
  setCategories([{ id: "default-expense-food", type: "expense", name: "อาหารและเครื่องดื่ม", icon: "utensils" }]);
  setBudgets([{ id: "b1", category: "อาหารและเครื่องดื่ม", limit: 1000 }]); // no categoryId
  setTransactions([{ id: "t1", type: "expense", date: "2026-03-05", category: "อาหารและเครื่องดื่ม", amount: 250 }]); // no categoryId
  const [result] = computeBudgets("2026-03");
  assert.equal(result.spentFmt, "฿250.00", "still matches by name+type when neither row has categoryId yet");
});

test("checkBudgetAlert: fires using the category's current display name, not a stale .category string", () => {
  setCategories([{ id: "cat-food", type: "expense", name: "Groceries (renamed)", icon: "utensils" }]);
  setBudgets([{ id: "b1", category: "อาหารและเครื่องดื่ม", categoryId: "cat-food", limit: 100 }]);
  setTransactions([{ id: "t0", type: "expense", date: new Date().toISOString().slice(0, 7) + "-01", category: "อาหารและเครื่องดื่ม", categoryId: "cat-food", amount: 90 }]);
  const newTx = { type: "expense", date: new Date().toISOString().slice(0, 10), category: "อาหารและเครื่องดื่ม", categoryId: "cat-food", amount: 20 };
  const msg = checkBudgetAlert(newTx);
  assert.match(msg, /Groceries \(renamed\)/);
});

test("computeBreakdown: groups two transactions with different .category text but the same categoryId into one entry", () => {
  setCategories([{ id: "cat-food", type: "expense", name: "Food", icon: "utensils" }]);
  setTransactions([
    { id: "t1", type: "expense", date: "2026-03-05", category: "Old Name", categoryId: "cat-food", amount: 100 },
    { id: "t2", type: "expense", date: "2026-03-10", category: "New Name", categoryId: "cat-food", amount: 50 }
  ]);
  const entries = computeBreakdown("2026-03");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].category, "Food");
  assert.equal(entries[0].total, 150);
});
