import test from "node:test";
import assert from "node:assert/strict";
import { state, setBills, setTransactions, setBudgets, setCategories, setAccounts } from "../src/state.js";
import {
  nextBillDueDate, daysUntilBillDue, billDueCycle, dueSoonLabel, upcomingBills, monthKeyOf,
  pctDeltaLabel, monthHasTransactions, monthTotal, unbudgetedSpend, unbudgetedSpendForYear, unbudgetedSpendForRange,
  computeBudgets, computeBudgetsForRange, checkBudgetAlert, computeBreakdown, computeBreakdownForRange,
  mostUsedCategoryIds, filteredTxList, groupByDate, availableMonthKeys, computeBalance, defaultAccountId, computeSparklinePoints
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

// Same idea, but also pins process.env.TZ so Date's local getters (which
// every "now" computation in this app must go through -- see utils.js's
// localDateIso/localMonthKey) resolve against a real, UTC-ahead timezone
// instead of whatever timezone the test runner happens to be in. CI runs
// in UTC, where the timezone bug these tests guard against is invisible,
// so exercising it for real requires forcing a non-UTC, UTC-ahead zone.
function withFakeNowInTZ(t, utcIsoDateTime, tz, fn) {
  const originalTZ = process.env.TZ;
  process.env.TZ = tz;
  t.mock.timers.enable({ apis: ["Date"], now: new Date(utcIsoDateTime).getTime() });
  try { fn(); } finally { t.mock.timers.reset(); process.env.TZ = originalTZ; }
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

test("monthTotal/monthHasTransactions: an optional accountId scopes to just that account, stage 5 of docs/specs/multi-account-support.md -- omitted means every account combined, unchanged from before", () => {
  setTransactions([
    { id: "t1", type: "expense", date: "2026-03-05", accountId: "acc0", amount: 100 },
    { id: "t2", type: "expense", date: "2026-03-06", accountId: "acc1", amount: 40 }
  ]);
  assert.equal(monthTotal("2026-03", "expense"), 140, "no accountId: combined across all accounts, unchanged behavior");
  assert.equal(monthTotal("2026-03", "expense", "acc0"), 100);
  assert.equal(monthTotal("2026-03", "expense", "acc1"), 40);
  assert.equal(monthTotal("2026-03", "expense", "acc-nonexistent"), 0);
  assert.equal(monthHasTransactions("2026-03", "expense", "acc0"), true);
  assert.equal(monthHasTransactions("2026-03", "expense", "acc-nonexistent"), false);
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

test("mostUsedCategoryIds: ranks by usage count, most-used first", () => {
  setCategories([
    { id: "c-food", type: "expense", name: "Food", sortOrder: 0 },
    { id: "c-transport", type: "expense", name: "Transport", sortOrder: 1 },
    { id: "c-shopping", type: "expense", name: "Shopping", sortOrder: 2 }
  ]);
  setTransactions([
    { id: "t1", type: "expense", date: "2026-03-01", categoryId: "c-shopping", amount: 10 },
    { id: "t2", type: "expense", date: "2026-03-02", categoryId: "c-food", amount: 10 },
    { id: "t3", type: "expense", date: "2026-03-03", categoryId: "c-food", amount: 10 },
    { id: "t4", type: "expense", date: "2026-03-04", categoryId: "c-food", amount: 10 }
  ]);
  assert.deepEqual(mostUsedCategoryIds("expense", 3), ["c-food", "c-shopping", "c-transport"]);
});

test("mostUsedCategoryIds: zero history falls back to categories' own sortOrder", () => {
  setCategories([
    { id: "c-b", type: "expense", name: "B", sortOrder: 1 },
    { id: "c-a", type: "expense", name: "A", sortOrder: 0 },
    { id: "c-c", type: "expense", name: "C", sortOrder: 2 }
  ]);
  setTransactions([]);
  assert.deepEqual(mostUsedCategoryIds("expense", 3), ["c-a", "c-b", "c-c"]);
});

test("mostUsedCategoryIds: ranked usage is padded with sortOrder fallback up to n, no duplicates", () => {
  setCategories([
    { id: "c-food", type: "expense", name: "Food", sortOrder: 0 },
    { id: "c-transport", type: "expense", name: "Transport", sortOrder: 1 },
    { id: "c-shopping", type: "expense", name: "Shopping", sortOrder: 2 }
  ]);
  setTransactions([{ id: "t1", type: "expense", date: "2026-03-01", categoryId: "c-shopping", amount: 10 }]);
  assert.deepEqual(mostUsedCategoryIds("expense", 3), ["c-shopping", "c-food", "c-transport"]);
});

test("mostUsedCategoryIds: excludes deleted categories and other types", () => {
  setCategories([
    { id: "c-food", type: "expense", name: "Food", sortOrder: 0 },
    { id: "c-gone", type: "expense", name: "Gone", sortOrder: 1, deleted: true },
    { id: "c-salary", type: "income", name: "Salary", sortOrder: 0 }
  ]);
  setTransactions([
    { id: "t1", type: "expense", date: "2026-03-01", categoryId: "c-gone", amount: 100 },
    { id: "t2", type: "income", date: "2026-03-01", categoryId: "c-salary", amount: 100 }
  ]);
  assert.deepEqual(mostUsedCategoryIds("expense", 5), ["c-food"]);
});

// docs/specs/transactions-filters-rework.md
function resetTxFilters() {
  state.txFilterType = "all"; state.txFilterMonthNum = "all"; state.txFilterYear = "all";
  state.txFilterCategory = new Set(); state.txFilterAccount = new Set(); state.txPeriodMode = "all"; state.txSearch = "";
  state.txFilterAmountMin = null; state.txFilterAmountMax = null;
  state.txFilterDateFrom = ""; state.txFilterDateTo = "";
}
test("filteredTxList: multi-select category filter returns the union of every selected category", () => {
  resetTxFilters();
  setTransactions([
    { id: "t1", type: "expense", date: "2026-03-01", categoryId: "c-food", amount: 100 },
    { id: "t2", type: "expense", date: "2026-03-02", categoryId: "c-transport", amount: 50 },
    { id: "t3", type: "expense", date: "2026-03-03", categoryId: "c-shopping", amount: 20 }
  ]);
  state.txFilterCategory = new Set(["c-food", "c-transport"]);
  assert.deepEqual(filteredTxList().map((t) => t.id).sort(), ["t1", "t2"]);
  resetTxFilters();
});
test("filteredTxList: multi-select account filter returns the union of every selected account, stage 6 of docs/specs/multi-account-support.md -- mirrors the category filter's union behavior", () => {
  resetTxFilters();
  setTransactions([
    { id: "t1", type: "expense", date: "2026-03-01", accountId: "acc0", amount: 100 },
    { id: "t2", type: "expense", date: "2026-03-02", accountId: "acc1", amount: 50 },
    { id: "t3", type: "expense", date: "2026-03-03", accountId: "acc2", amount: 20 }
  ]);
  state.txFilterAccount = new Set(["acc0", "acc1"]);
  assert.deepEqual(filteredTxList().map((t) => t.id).sort(), ["t1", "t2"]);
  resetTxFilters();
});
test("filteredTxList: a transaction under an archived account still matches the account filter -- archived only restricts new transactions (Add screen), never read paths like this one", () => {
  resetTxFilters();
  setAccounts([{ id: "acc-old", name: "Closed bank", icon: "landmark", openingBalance: 0, archived: true }]);
  setTransactions([{ id: "t1", type: "expense", date: "2026-03-01", accountId: "acc-old", amount: 10 }]);
  state.txFilterAccount = new Set(["acc-old"]);
  assert.deepEqual(filteredTxList().map((t) => t.id), ["t1"]);
  resetTxFilters();
});
test("filteredTxList: amount range is inclusive at exact boundary values", () => {
  resetTxFilters();
  setTransactions([
    { id: "t1", type: "expense", date: "2026-03-01", amount: 100 },
    { id: "t2", type: "expense", date: "2026-03-02", amount: 500 },
    { id: "t3", type: "expense", date: "2026-03-03", amount: 99 },
    { id: "t4", type: "expense", date: "2026-03-04", amount: 501 }
  ]);
  state.txFilterAmountMin = 100; state.txFilterAmountMax = 500;
  assert.deepEqual(filteredTxList().map((t) => t.id).sort(), ["t1", "t2"]);
  resetTxFilters();
});
test("filteredTxList: custom period mode filters by date range instead of month/year", () => {
  resetTxFilters();
  setTransactions([
    { id: "t1", type: "expense", date: "2026-03-05", amount: 10 },
    { id: "t2", type: "expense", date: "2026-03-15", amount: 10 },
    { id: "t3", type: "expense", date: "2026-03-25", amount: 10 }
  ]);
  state.txPeriodMode = "custom"; state.txFilterDateFrom = "2026-03-10"; state.txFilterDateTo = "2026-03-20";
  assert.deepEqual(filteredTxList().map((t) => t.id), ["t2"]);
  resetTxFilters();
});
test("computeBreakdown: an explicit categoryIds filter runs before the top-6 cap, so a selected low-spend category still appears", () => {
  setCategories([
    { id: "c1", type: "expense", name: "One" }, { id: "c2", type: "expense", name: "Two" },
    { id: "c3", type: "expense", name: "Three" }, { id: "c4", type: "expense", name: "Four" },
    { id: "c5", type: "expense", name: "Five" }, { id: "c6", type: "expense", name: "Six" },
    { id: "c7", type: "expense", name: "Seven (low spend)" }
  ]);
  setTransactions([
    { id: "t1", type: "expense", date: "2026-03-01", categoryId: "c1", amount: 700 },
    { id: "t2", type: "expense", date: "2026-03-01", categoryId: "c2", amount: 600 },
    { id: "t3", type: "expense", date: "2026-03-01", categoryId: "c3", amount: 500 },
    { id: "t4", type: "expense", date: "2026-03-01", categoryId: "c4", amount: 400 },
    { id: "t5", type: "expense", date: "2026-03-01", categoryId: "c5", amount: 300 },
    { id: "t6", type: "expense", date: "2026-03-01", categoryId: "c6", amount: 200 },
    { id: "t7", type: "expense", date: "2026-03-01", categoryId: "c7", amount: 1 }
  ]);
  const unfiltered = computeBreakdown("2026-03");
  assert.ok(!unfiltered.some((r) => r.categoryId === "c7"));
  const filtered = computeBreakdown("2026-03", new Set(["c7"]));
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].categoryId, "c7");
});

test("filteredTxList: \"today\" period mode filters to just today's date", (t) => {
  withFakeNow(t, "2026-03-15T12:00:00", () => {
    resetTxFilters();
    setTransactions([
      { id: "t1", type: "expense", date: "2026-03-14", amount: 10 },
      { id: "t2", type: "expense", date: "2026-03-15", amount: 10 },
      { id: "t3", type: "expense", date: "2026-03-16", amount: 10 }
    ]);
    state.txPeriodMode = "today";
    assert.deepEqual(filteredTxList().map((row) => row.id), ["t2"]);
    resetTxFilters();
  });
});
test("computeBudgetsForRange: sums spend within the date range and compares against the plain (unscaled) monthly limit", () => {
  setCategories([{ id: "cat-food", type: "expense", name: "Food" }]);
  setBudgets([{ id: "b1", category: "Food", categoryId: "cat-food", limit: 1000 }]);
  setTransactions([
    { id: "t1", type: "expense", date: "2026-03-05", categoryId: "cat-food", amount: 300 },
    { id: "t2", type: "expense", date: "2026-03-10", categoryId: "cat-food", amount: 400 },
    { id: "t3", type: "expense", date: "2026-03-20", categoryId: "cat-food", amount: 999 } // outside the range
  ]);
  const [result] = computeBudgetsForRange("2026-03-01", "2026-03-15");
  assert.equal(result.spentFmt, "฿700.00");
  assert.equal(result.limitFmt, "฿1,000.00", "unlike computeBudgetsForYear, the limit is not scaled for an arbitrary range");
});
test("unbudgetedSpendForRange: totals expense transactions with no matching budget, within the date range only", () => {
  setCategories([{ id: "cat-food", type: "expense", name: "Food" }, { id: "cat-health", type: "expense", name: "Health" }]);
  setBudgets([{ id: "b1", category: "Food", categoryId: "cat-food", limit: 1000 }]);
  setTransactions([
    { id: "t1", type: "expense", date: "2026-03-05", categoryId: "cat-food", amount: 300 }, // budgeted, excluded
    { id: "t2", type: "expense", date: "2026-03-10", categoryId: "cat-health", amount: 150 }, // unbudgeted, in range
    { id: "t3", type: "expense", date: "2026-03-20", categoryId: "cat-health", amount: 500 } // unbudgeted, outside range
  ]);
  assert.equal(unbudgetedSpendForRange("2026-03-01", "2026-03-15"), 150);
});
test("computeBreakdownForRange: sums only transactions within the date range, same shape as computeBreakdown", () => {
  setCategories([{ id: "cat-food", type: "expense", name: "Food" }]);
  setTransactions([
    { id: "t1", type: "expense", date: "2026-03-05", categoryId: "cat-food", amount: 100 },
    { id: "t2", type: "expense", date: "2026-03-10", categoryId: "cat-food", amount: 50 },
    { id: "t3", type: "expense", date: "2026-03-20", categoryId: "cat-food", amount: 999 } // outside the range
  ]);
  const [result] = computeBreakdownForRange("2026-03-01", "2026-03-15");
  assert.equal(result.total, 150);
});

// --- timezone bug regression coverage ---
// 2026-08-31T19:00:00Z is already 2026-09-01 02:00 in Bangkok (UTC+7) --
// a new day AND a new month locally, while UTC (and therefore the old
// `.toISOString()`-based code) still reads 2026-08-31. This is exactly the
// window (local midnight to 7am Bangkok time) that let the bug ship
// undetected, since CI runs in UTC where it's invisible.

test("computeBudgets: with no explicit month, falls back to the LOCAL current month, not UTC's", (t) => {
  withFakeNowInTZ(t, "2026-08-31T19:00:00Z", "Asia/Bangkok", () => {
    setCategories([{ id: "cat-food", type: "expense", name: "Food" }]);
    setBudgets([{ id: "b1", category: "Food", categoryId: "cat-food", limit: 1000 }]);
    setTransactions([{ id: "t1", type: "expense", date: "2026-09-01", categoryId: "cat-food", amount: 300 }]);
    const [result] = computeBudgets();
    assert.equal(result.spentFmt, "฿300.00", "a transaction dated in the LOCAL current month (Sept 1 Bangkok time) must count, even though UTC still reads Aug 31");
  });
});

test("unbudgetedSpend: with no explicit month, falls back to the LOCAL current month, not UTC's", (t) => {
  withFakeNowInTZ(t, "2026-08-31T19:00:00Z", "Asia/Bangkok", () => {
    setBudgets([]);
    setTransactions([{ id: "t1", type: "expense", date: "2026-09-01", category: "Health", amount: 150 }]);
    assert.equal(unbudgetedSpend(), 150);
  });
});

test("checkBudgetAlert: its current-month check falls back to the LOCAL current month, not UTC's", (t) => {
  withFakeNowInTZ(t, "2026-08-31T19:00:00Z", "Asia/Bangkok", () => {
    setCategories([{ id: "cat-food", type: "expense", name: "Food" }]);
    setBudgets([{ id: "b1", category: "Food", categoryId: "cat-food", limit: 100 }]);
    // Already-saved spend for today (local), dated in the LOCAL current
    // month (Sept 1 Bangkok time) -- if curMonthKey fell back to UTC's
    // "2026-08" instead, monthKey(newTx.date) ("2026-09") would never
    // match it and this would wrongly return null before even looking
    // at the budget.
    setTransactions([{ id: "t0", type: "expense", date: "2026-09-01", category: "Food", categoryId: "cat-food", amount: 90 }]);
    const newTx = { type: "expense", date: "2026-09-01", category: "Food", categoryId: "cat-food", amount: 5 };
    const msg = checkBudgetAlert(newTx);
    assert.ok(msg, "a transaction dated today (local) must be recognized as this month's spend, not silently ignored because UTC still reads last month");
  });
});

test("filteredTxList: \"today\" period mode uses the LOCAL date, not UTC's", (t) => {
  withFakeNowInTZ(t, "2026-08-31T19:00:00Z", "Asia/Bangkok", () => {
    resetTxFilters();
    setTransactions([
      { id: "t1", type: "expense", date: "2026-08-31", amount: 10 }, // "today" in UTC -- must NOT match
      { id: "t2", type: "expense", date: "2026-09-01", amount: 10 } // "today" in Bangkok -- must match
    ]);
    state.txPeriodMode = "today";
    assert.deepEqual(filteredTxList().map((row) => row.id), ["t2"]);
    resetTxFilters();
  });
});

test("groupByDate: labels today's/yesterday's rows using the LOCAL date, not UTC's", (t) => {
  withFakeNowInTZ(t, "2026-08-31T19:00:00Z", "Asia/Bangkok", () => {
    state.lang = "en";
    const txs = [
      { id: "t1", date: "2026-09-01", updatedAt: 2 }, // today, Bangkok time
      { id: "t2", date: "2026-08-31", updatedAt: 1 } // yesterday, Bangkok time (still "today" in UTC)
    ];
    const groups = groupByDate(txs);
    assert.equal(groups[0].label, "Today");
    assert.equal(groups[1].label, "Yesterday");
  });
});

test("availableMonthKeys: always includes the LOCAL current month, not UTC's", (t) => {
  withFakeNowInTZ(t, "2026-08-31T19:00:00Z", "Asia/Bangkok", () => {
    setTransactions([]);
    assert.deepEqual(availableMonthKeys(), ["2026-09"]);
  });
});

test("computeBalance(null): with every account's opening balance at 0 (the migration's own default), matches plain income - expense exactly -- the actual regression check for the account-migration's balance math", () => {
  setAccounts([
    { id: "acc0", name: "Cash", icon: "wallet", openingBalance: 0, archived: false },
    { id: "acc1", name: "Bank", icon: "landmark", openingBalance: 0, archived: false }
  ]);
  setTransactions([
    { id: "t1", type: "income", date: "2026-03-01", accountId: "acc0", amount: 1000 },
    { id: "t2", type: "expense", date: "2026-03-02", accountId: "acc1", amount: 300 },
    { id: "t3", type: "expense", date: "2026-03-03", accountId: "acc0", amount: 150 }
  ]);
  assert.equal(computeBalance(null), 1000 - 300 - 150);
});

test("computeBalance(accountId): a specific account's balance is its own opening balance plus only its own transactions", () => {
  setAccounts([
    { id: "acc0", name: "Cash", icon: "wallet", openingBalance: 500, archived: false },
    { id: "acc1", name: "Bank", icon: "landmark", openingBalance: 2000, archived: false }
  ]);
  setTransactions([
    { id: "t1", type: "income", date: "2026-03-01", accountId: "acc0", amount: 1000 },
    { id: "t2", type: "expense", date: "2026-03-02", accountId: "acc1", amount: 300 }
  ]);
  assert.equal(computeBalance("acc0"), 500 + 1000);
  assert.equal(computeBalance("acc1"), 2000 - 300);
});

test("computeBalance(null): combined balance still includes an archived account's opening balance and transactions -- archiving restricts new transactions, not existing balance", () => {
  setAccounts([
    { id: "acc0", name: "Cash", icon: "wallet", openingBalance: 0, archived: false },
    { id: "acc1", name: "Old bank", icon: "landmark", openingBalance: 1000, archived: true }
  ]);
  setTransactions([{ id: "t1", type: "expense", date: "2026-03-01", accountId: "acc1", amount: 200 }]);
  assert.equal(computeBalance(null), 1000 - 200);
});

test("computeBalance(null): a transfer nets to exactly zero on the combined balance -- stage 1 of docs/specs/account-transfers.md's actual regression check (money moved, none left or entered)", () => {
  setAccounts([
    { id: "acc0", name: "Cash", icon: "wallet", openingBalance: 0, archived: false },
    { id: "acc1", name: "Bank", icon: "landmark", openingBalance: 0, archived: false }
  ]);
  setTransactions([
    { id: "t1", type: "income", date: "2026-03-01", accountId: "acc0", amount: 1000 },
    { id: "t2", type: "transfer", date: "2026-03-02", accountId: "acc0", toAccountId: "acc1", amount: 300 }
  ]);
  assert.equal(computeBalance(null), 1000, "the transfer must not be silently subtracted just because its type isn't literally \"income\"");
});

test("computeBalance(accountId): a transfer moves the amount out of the source account and into the destination account", () => {
  setAccounts([
    { id: "acc0", name: "Cash", icon: "wallet", openingBalance: 1000, archived: false },
    { id: "acc1", name: "Bank", icon: "landmark", openingBalance: 0, archived: false }
  ]);
  setTransactions([{ id: "t1", type: "transfer", date: "2026-03-01", accountId: "acc0", toAccountId: "acc1", amount: 300 }]);
  assert.equal(computeBalance("acc0"), 1000 - 300, "source account loses the transfer amount");
  assert.equal(computeBalance("acc1"), 0 + 300, "destination account gains the transfer amount");
});

test("computeSparklinePoints: excludes transfers entirely, in both the combined and per-account cases -- a decorative trend line, not a source of truth", () => {
  setAccounts([{ id: "acc0", name: "Cash", icon: "wallet", openingBalance: 0, archived: false }]);
  setTransactions([
    { id: "t1", type: "income", date: "2026-03-01", accountId: "acc0", amount: 100 },
    { id: "t2", type: "transfer", date: "2026-03-02", accountId: "acc0", toAccountId: "acc1", amount: 9999 }
  ]);
  assert.deepEqual(computeSparklinePoints(null), [100]);
  assert.deepEqual(computeSparklinePoints("acc0"), [100]);
});

test("filteredTxList: the account filter matches a transfer via either its source or destination account", () => {
  resetTxFilters();
  setTransactions([
    { id: "t1", type: "transfer", date: "2026-03-01", accountId: "acc0", toAccountId: "acc1", amount: 300 },
    { id: "t2", type: "expense", date: "2026-03-02", accountId: "acc2", amount: 50 }
  ]);
  state.txFilterAccount = new Set(["acc1"]);
  assert.deepEqual(filteredTxList().map((t) => t.id), ["t1"], "matching the destination account must not be missed");
  state.txFilterAccount = new Set(["acc0"]);
  assert.deepEqual(filteredTxList().map((t) => t.id), ["t1"], "matching the source account (still just .accountId) keeps working");
  resetTxFilters();
});

test("defaultAccountId: returns the most recent transaction's account when it's still active", () => {
  setAccounts([
    { id: "acc0", name: "Cash", icon: "wallet", openingBalance: 0, archived: false },
    { id: "acc1", name: "Bank", icon: "landmark", openingBalance: 0, archived: false }
  ]);
  setTransactions([
    { id: "t1", type: "expense", date: "2026-03-01", accountId: "acc0", amount: 10, updatedAt: 1 },
    { id: "t2", type: "expense", date: "2026-03-02", accountId: "acc1", amount: 10, updatedAt: 2 }
  ]);
  assert.equal(defaultAccountId(), "acc1");
});

test("defaultAccountId: falls back to the first active account when the last transaction's account was since archived", () => {
  setAccounts([
    { id: "acc0", name: "Cash", icon: "wallet", openingBalance: 0, archived: false },
    { id: "acc1", name: "Old bank", icon: "landmark", openingBalance: 0, archived: true }
  ]);
  setTransactions([{ id: "t1", type: "expense", date: "2026-03-01", accountId: "acc1", amount: 10, updatedAt: 1 }]);
  assert.equal(defaultAccountId(), "acc0");
});

test("defaultAccountId: returns null when there are zero active accounts", () => {
  setAccounts([{ id: "acc0", name: "Old cash", icon: "wallet", openingBalance: 0, archived: true }]);
  setTransactions([]);
  assert.equal(defaultAccountId(), null);
});
