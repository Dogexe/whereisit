import { state, transactions, budgets, bills, categories, accounts } from "./state.js";
import { monthKey, fmtMoney, monthLabel, dateLabel, displayYear, monthKeyOf, localDateIso, localMonthKey, localIsoFromDate } from "./utils.js";
import { findCategoryId, categoryDisplayName, ancestorId } from "./categories.js";
import { L } from "./i18n.js";

// Budgets/transactions are moving from being matched by plain category
// name to a stable categoryId (docs/specs/custom-categories.md stage 2),
// but not every row has one yet -- pre-migration rows until the one-time
// backfill runs, or any row created in the gap before a later stage moves
// the Add/Settings screens themselves to writing categoryId directly.
// Falling back to a name+type lookup here means every function below
// works correctly regardless of which state a given row is in, without
// needing to know or care which. Budgets/bills have no `.type` field of
// their own (always expense-side -- see settings.js's own comment on
// this), so callers pass "expense" explicitly for those.
// Exported so settings.js's category delete guard (stage 3) can check
// "is this category still referenced by any transaction/budget/bill"
// using the exact same matching logic as every read path here, rather
// than a second copy that could drift out of sync with it.
export function resolveCategoryId(row, type) {
  return row.categoryId || findCategoryId(categories, row.category, type);
}
function displayName(id, fallback) {
  return categoryDisplayName(categories, id, fallback);
}

// docs/specs/category-icon-chips.md: ranks a type's categories by how
// often they're actually used (via resolveCategoryId, so it works on
// pre-backfill rows too), then pads any remaining slots up to n from
// categories' own sortOrder -- this is what makes a brand-new account
// (zero transactions to rank from) still show a sensible, stable default
// row instead of an empty or randomly-ordered one.
export function mostUsedCategoryIds(type, n) {
  const counts = new Map();
  transactions.forEach((t) => {
    if (t.type !== type) return;
    const id = resolveCategoryId(t, type);
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  });
  const live = categories.filter((c) => c.type === type && !c.deleted);
  const liveIds = new Set(live.map((c) => c.id));
  const ranked = Array.from(counts.entries())
    .filter(([id]) => liveIds.has(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const rest = live.slice().sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => c.id).filter((id) => !ranked.includes(id));
  return ranked.concat(rest).slice(0, n);
}

// Stage 2 of docs/specs/multi-account-support.md. accountId: null means "all
// accounts combined" -- every account's opening balance plus every
// transaction regardless of account, deliberately including archived
// accounts (their balance is real money that existed; archiving only
// restricts them as a target for *new* transactions, a UI-layer rule, not
// a math one -- see the spec's decision 8). A specific id means that one
// account's own opening balance plus only its own transactions.
//
// Stage 1 of docs/specs/account-transfers.md: a transfer (type "transfer")
// has no .accountId of its own (it has fromAccountId/toAccountId, i.e.
// .accountId is the from side and .toAccountId is the destination) and its
// combined effect across every account is always exactly zero -- money
// just moved, none of it left or entered the household. The combined
// branch below explicitly filters to income/expense before reducing
// (rather than assuming "not income" means "subtract", which used to
// silently subtract a transfer's amount instead of netting it to zero);
// the per-account branch adds a second reduce specifically for transfers
// touching that account, since income/expense's own .accountId-based
// filter never matches a transfer row at all.
export function computeBalance(accountId) {
  if (accountId == null) {
    const openingSum = accounts.reduce((a, acc) => a + (acc.openingBalance || 0), 0);
    const net = transactions.filter((t) => t.type === "income" || t.type === "expense")
      .reduce((a, t) => a + (t.type === "income" ? t.amount : -t.amount), 0);
    return openingSum + net;
  }
  const acc = accounts.find((a) => a.id === accountId);
  const opening = acc ? (acc.openingBalance || 0) : 0;
  const net = transactions.filter((t) => t.accountId === accountId && (t.type === "income" || t.type === "expense"))
    .reduce((a, t) => a + (t.type === "income" ? t.amount : -t.amount), 0);
  const transferNet = transactions.filter((t) => t.type === "transfer")
    .reduce((a, t) => {
      // A transfer's .accountId IS the source ("from") account -- the
      // existing field is reused rather than adding a separate fromAccountId,
      // per the spec's schema decision (only toAccountId is new).
      if (t.accountId === accountId) return a - t.amount;
      if (t.toAccountId === accountId) return a + t.amount;
      return a;
    }, 0);
  return opening + net + transferNet;
}
// The Add screen's default account pick: whichever account the user's most
// recent transaction used, as long as it's still active (not archived) --
// falls back to the first active account otherwise (e.g. right after the
// default account is created with zero transactions yet, or if the last
// transaction's account was since archived). Never returns an archived
// account, and returns null only when there are zero active accounts at
// all (shouldn't normally happen -- Settings blocks archiving the last
// active one -- but a total function is safer than assuming).
export function defaultAccountId() {
  const active = accounts.filter((a) => !a.archived);
  const lastTx = transactions.slice().sort(byRecency)[0];
  if (lastTx && lastTx.accountId && active.some((a) => a.id === lastTx.accountId)) return lastTx.accountId;
  return (active[0] || {}).id || null;
}

// Shared by computeBudgets/computeBudgetsForYear/computeBudgetsForRange --
// each just supplies its own transaction predicate and a limit multiplier
// (yearly = monthly limit x12, since there's no separate yearly limit
// field; today/custom range compare against the plain monthly limit --
// see computeBudgetsForRange's own comment for why that's x1, not scaled).
function budgetRowsFor(txPredicate, limitMultiplier) {
  const spentByCategoryId = {};
  transactions.filter((t) => t.type === "expense" && txPredicate(t)).forEach((t) => {
    const cid = resolveCategoryId(t, "expense");
    spentByCategoryId[cid] = (spentByCategoryId[cid] || 0) + t.amount;
  });
  return budgets.map((b) => {
    const bid = resolveCategoryId(b, "expense");
    const spent = spentByCategoryId[bid] || 0;
    const limit = b.limit * limitMultiplier;
    const pct = Math.min(100, Math.round((spent / limit) * 100));
    const over = spent > limit;
    const near = !over && spent / limit >= 0.8;
    return {
      category: displayName(bid, b.category), categoryId: bid, spentFmt: fmtMoney(spent), limitFmt: fmtMoney(limit), pct,
      barColor: over ? "var(--color-expense)" : (near ? "var(--color-warning)" : "var(--color-accent)"),
      badgeClass: over ? "badge-expense" : (near ? "badge-warn" : "badge-brand"),
      statusLabel: over ? L().overBudget : pct + "%"
    };
  });
}
export function computeBudgets(forMonth) {
  const targetMonth = forMonth || localMonthKey();
  return budgetRowsFor((t) => monthKey(t.date) === targetMonth, 1);
}
// Same shape as computeBudgets, but sums a whole year's spend per category
// and compares it against the monthly limit x12 (there's no separate yearly
// limit field -- budgets are defined as one monthly figure per category).
export function computeBudgetsForYear(forYear) {
  const targetYear = forYear || String(new Date().getFullYear());
  return budgetRowsFor((t) => t.date.slice(0, 4) === targetYear, 12);
}
// Same shape again, for the Insights "today"/"custom range" period modes
// (docs/specs/transactions-filters-rework.md's Insights follow-up). Unlike
// the yearly variant, there's no clean scaling factor for an arbitrary
// day range, so this deliberately compares against the plain monthly limit
// (x1) -- "how much of this month's budget did you use in this window,"
// which is the useful framing for both a single "today" and a custom span.
export function computeBudgetsForRange(fromDate, toDate) {
  return budgetRowsFor((t) => t.date >= fromDate && t.date <= toDate, 1);
}
// Shared by unbudgetedSpend/unbudgetedSpendForYear/unbudgetedSpendForRange.
// computeBudgets*() only iterate existing budgets, so spending in an
// expense category nobody ever set a limit for never appeared anywhere on
// the screen users read as "where my money went" -- with seeded data,
// health (no budget) and utilities (no budget) totaled more than a third
// of all spending and showed up nowhere. These total exactly what those
// omit: expense transactions whose category has no matching budget entry.
function unbudgetedSpendFor(txPredicate) {
  const budgetedIds = new Set(budgets.map((b) => resolveCategoryId(b, "expense")));
  return transactions
    .filter((t) => t.type === "expense" && !budgetedIds.has(resolveCategoryId(t, "expense")) && txPredicate(t))
    .reduce((a, t) => a + t.amount, 0);
}
export function unbudgetedSpend(forMonth) {
  const targetMonth = forMonth || localMonthKey();
  return unbudgetedSpendFor((t) => monthKey(t.date) === targetMonth);
}
export function unbudgetedSpendForYear(forYear) {
  const targetYear = forYear || String(new Date().getFullYear());
  return unbudgetedSpendFor((t) => t.date.slice(0, 4) === targetYear);
}
export function unbudgetedSpendForRange(fromDate, toDate) {
  return unbudgetedSpendFor((t) => t.date >= fromDate && t.date <= toDate);
}
// Returns an alert message if adding/editing `tx` pushed its budget category
// to 80%+ of its monthly limit, or null if no budget applies / still under.
export function checkBudgetAlert(tx) {
  if (!tx || tx.type !== "expense") return null;
  const curMonthKey = localMonthKey();
  if (monthKey(tx.date) !== curMonthKey) return null;
  const txCid = resolveCategoryId(tx, "expense");
  const budget = budgets.find((b) => resolveCategoryId(b, "expense") === txCid);
  if (!budget) return null;
  const spent = transactions.filter((t) => t.type === "expense" && resolveCategoryId(t, "expense") === txCid && monthKey(t.date) === curMonthKey).reduce((a, t) => a + t.amount, 0);
  const catName = displayName(txCid, tx.category);
  if (spent >= budget.limit) return L().toastBudgetOver.replace("{cat}", catName);
  if (spent / budget.limit >= 0.8) return L().toastBudgetNear.replace("{cat}", catName);
  return null;
}
// A bill's `day` recurs every month. This used to roll forward to next
// month as soon as `day` had passed, with no awareness of whether the
// current cycle was actually paid -- so an unpaid bill could never go
// overdue: by the day after it was due, the app already treated it as
// next month's bill and dropped it off every due-soon list, with no
// record it was ever missed. Takes the whole bill (needs `day` and
// `lastPaidCycle`) so it can tell whether *this* cycle was paid: while
// unpaid, the due date stays pinned to this cycle's date (so daysUntil
// can go negative and the bill reads as overdue); it only rolls forward
// once lastPaidCycle matches this cycle.
//
// Design choice: an overdue bill stays overdue only through the end of
// its own calendar cycle, then rolls to next month's due date on the 1st
// regardless of whether it was ever marked paid -- it is not held
// indefinitely across month boundaries. Holding indefinitely would need
// persisting which specific missed cycle is still outstanding, rather
// than just "was the bill paid for its current cycle" -- and an
// indefinitely-growing "47 days overdue" is a worse nudge than the bill
// resetting to a fresh, still-visible countdown each month.
export function nextBillDueDate(bill) {
  const now = new Date();
  const dueYear = now.getFullYear(), dueMonth = now.getMonth();
  const lastDayOfThisMonth = new Date(dueYear, dueMonth + 1, 0).getDate();
  const thisCycleDate = new Date(dueYear, dueMonth, Math.min(bill.day, lastDayOfThisMonth));
  if (bill.lastPaidCycle !== monthKeyOf(thisCycleDate)) return thisCycleDate;
  // This cycle is already paid -- roll forward to next month's date.
  let nextMonth = dueMonth + 1, nextYear = dueYear;
  if (nextMonth > 11) { nextMonth = 0; nextYear += 1; }
  const lastDayOfNextMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
  return new Date(nextYear, nextMonth, Math.min(bill.day, lastDayOfNextMonth));
}
export function daysUntilBillDue(bill) {
  const due = nextBillDueDate(bill);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86400000);
}
// Sorts newest-first: primarily by transaction date, but same-day entries
// are broken by actual insert/edit recency (updatedAt) so the one you just
// added always lands above ones you added earlier the same day.
export function byRecency(a, b) {
  const byDate = b.date.localeCompare(a.date);
  if (byDate !== 0) return byDate;
  return (b.updatedAt || 0) - (a.updatedAt || 0);
}
// docs/specs/transactions-filters-rework.md: lives here rather than in
// screens/transactions.js because it's pure (reads state/transactions,
// no DOM/render/toast/save/sync side effects) -- same rule every other
// function in this file follows, and it's what keeps this testable via
// setTransactions()/setCategories() the same way the rest of derived.js
// already is (screens/transactions.js itself has a module-level
// document.addEventListener now, which makes it unsafe to import from a
// Node test -- this function needed to not live there for that reason too).
export function filteredTxList() {
  let rows = transactions.slice();
  if (state.txFilterType !== "all") rows = rows.filter((t) => t.type === state.txFilterType);
  if (state.txPeriodMode === "today") {
    const today = localDateIso();
    rows = rows.filter((t) => t.date === today);
  } else if (state.txPeriodMode === "custom") {
    if (state.txFilterDateFrom) rows = rows.filter((t) => t.date >= state.txFilterDateFrom);
    if (state.txFilterDateTo) rows = rows.filter((t) => t.date <= state.txFilterDateTo);
  } else {
    if (state.txFilterMonthNum !== "all") rows = rows.filter((t) => t.date.slice(5, 7) === state.txFilterMonthNum);
    if (state.txFilterYear !== "all") rows = rows.filter((t) => t.date.slice(0, 4) === state.txFilterYear);
  }
  // txFilterCategory is a Set of ids (multi-select) -- resolveCategoryId
  // means this still matches a transaction whose own .category text has
  // since gone stale (renamed or predates the backfill).
  if (state.txFilterCategory.size > 0) rows = rows.filter((t) => state.txFilterCategory.has(resolveCategoryId(t, t.type)));
  // Stage 6 of docs/specs/multi-account-support.md -- same multi-select-Set
  // shape as the category filter just above. Stage 1 of
  // docs/specs/account-transfers.md added the transfer fallback: a
  // transfer's .accountId is its *from* account, so it already matches the
  // plain .has(t.accountId) check on that side, but its .toAccountId also
  // needs checking or a transfer would silently vanish from a filter
  // narrowed to just its destination account.
  if (state.txFilterAccount.size > 0) rows = rows.filter((t) => state.txFilterAccount.has(t.accountId) || (t.type === "transfer" && state.txFilterAccount.has(t.toAccountId)));
  if (state.txFilterAmountMin != null) rows = rows.filter((t) => t.amount >= state.txFilterAmountMin);
  if (state.txFilterAmountMax != null) rows = rows.filter((t) => t.amount <= state.txFilterAmountMax);
  const q = state.txSearch.trim().toLowerCase();
  if (q) rows = rows.filter((t) => (t.note || "").toLowerCase().includes(q) || categoryDisplayName(categories, resolveCategoryId(t, t.type), t.category).toLowerCase().includes(q));
  return rows.sort(byRecency);
}
// Splits an already-sorted (byRecency) transaction list into consecutive
// same-date runs, each labeled "Today"/"Yesterday" or the plain date. Does
// not itself sort or filter -- callers pass in whatever order they want
// preserved within and across groups.
export function groupByDate(txs) {
  const todayIso = localDateIso();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = localIsoFromDate(yesterday);
  const groups = [];
  let current = null;
  for (const t of txs) {
    if (!current || current.date !== t.date) {
      const label = t.date === todayIso ? L().todayLabel : t.date === yesterdayIso ? L().yesterdayLabel : dateLabel(t.date);
      current = { date: t.date, label, items: [] };
      groups.push(current);
    }
    current.items.push(t);
  }
  return groups;
}
export { monthKeyOf };
export function billDueCycle(bill) { return monthKeyOf(nextBillDueDate(bill)); }
export function dueSoonLabel(n) {
  if (n < 0) {
    const overdueDays = -n;
    return overdueDays === 1 ? L().overdueByDay : L().overdueByDays.replace("{n}", overdueDays);
  }
  if (n === 0) return L().dueToday;
  if (n === 1) return L().dueTomorrow;
  return L().dueInDays.replace("{n}", n);
}
// No lower bound on daysUntil here -- an overdue bill (negative daysUntil)
// must still pass this filter, not just a "due soon" one. The
// lastPaidCycle !== dueCycle check is now a defensive backstop rather than
// the primary paid-bill exclusion: nextBillDueDate() already rolls a paid
// bill's date forward to a genuinely different cycle, so dueCycle and
// lastPaidCycle only match here if that rollover somehow didn't happen.
export function upcomingBills() {
  return bills
    .map((b) => Object.assign({}, b, { daysUntil: daysUntilBillDue(b), dueCycle: billDueCycle(b) }))
    .filter((b) => b.daysUntil <= 7 && b.lastPaidCycle !== b.dueCycle)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}
export const CHART_COLORS = ["var(--color-accent)", "var(--color-income)", "var(--color-expense)", "var(--color-warning)", "#a190f7", "var(--color-tertiary)"];
// Aggregates by categoryId but keeps a display name alongside each total
// (rather than resolving it only at the end) so a transaction whose
// category can't be matched to anything current still falls back to its
// own stored .category text -- the same "never worse than before"
// fallback resolveCategoryId/displayName give every other function here.
// categoryIds (optional Set) filters *before* aggregation, not after --
// see docs/specs/transactions-filters-rework.md: entries are already
// capped to the top 6 by spend below, so a post-filter could silently hide
// a selected category that isn't in the unfiltered top 6. Filtering uses
// the transaction's OWN resolved category id, not its rolled-up ancestor
// -- picking a specific subcategory in the filter still shows only that
// subcategory's own transactions, even though the unfiltered donut below
// would show it merged into its parent's slice (docs/specs/
// category-nesting.md stage 5's decision on this).
function breakdownEntries(txs, categoryIds) {
  const filtered = categoryIds && categoryIds.size
    ? txs.filter((t) => categoryIds.has(resolveCategoryId(t, "expense") || t.category))
    : txs;
  const totals = {}, names = {};
  // docs/specs/category-nesting.md stage 5: a subcategory's spend rolls
  // up into its parent's slice -- ancestorId resolves a resolved id to
  // its top-level ancestor (itself, if it's already top-level, or if its
  // parent can't be resolved -- see that helper's own fallback). A row
  // that has no resolvable id at all (pre-backfill/pre-categoryId data)
  // keeps grouping by its raw stored .category text, same as before this
  // stage -- there's no id to roll up in that case.
  filtered.forEach((t) => {
    const resolvedId = resolveCategoryId(t, "expense");
    const cid = resolvedId ? ancestorId(categories, resolvedId) : t.category;
    totals[cid] = (totals[cid] || 0) + t.amount;
    names[cid] = t.category;
  });
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = entries.length ? entries[0][1] : 1;
  const sum = entries.reduce((a, [, v]) => a + v, 0) || 1;
  return entries.map(([cid, total], i) => ({
    category: displayName(cid, names[cid]), categoryId: cid, total, totalFmt: fmtMoney(total),
    pct: Math.max(4, Math.round((total / max) * 100)),
    sharePct: (total / sum) * 100,
    color: CHART_COLORS[i % CHART_COLORS.length]
  }));
}
export function computeBreakdown(forMonth, categoryIds) {
  const targetMonth = forMonth || localMonthKey();
  return breakdownEntries(transactions.filter((t) => t.type === "expense" && monthKey(t.date) === targetMonth), categoryIds);
}
// Same shape as computeBreakdown, but sums a whole year's spend per category.
export function computeBreakdownForYear(forYear, categoryIds) {
  const targetYear = forYear || String(new Date().getFullYear());
  return breakdownEntries(transactions.filter((t) => t.type === "expense" && t.date.slice(0, 4) === targetYear), categoryIds);
}
// Same shape again, for Insights' "today"/"custom range" period modes.
export function computeBreakdownForRange(fromDate, toDate, categoryIds) {
  return breakdownEntries(transactions.filter((t) => t.type === "expense" && t.date >= fromDate && t.date <= toDate), categoryIds);
}
export function pieChartSvg(entries) {
  const total = entries.reduce((a, e) => a + e.total, 0) || 1;
  // r + sw/2 must stay under the viewBox half-size (70) or the ring's
  // outer edge gets clipped by the SVG viewport (was r=52,sw=22 -> 63 > 60).
  const r = 46, cx = 70, cy = 70, sw = 20, circ = 2 * Math.PI * r;
  let offset = 0;
  const circles = entries.map((e) => {
    const dash = (e.total / total) * circ;
    const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${e.color}" stroke-width="${sw}" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"></circle>`;
    offset += dash;
    return el;
  }).join("");
  return `<svg width="140" height="140" viewBox="0 0 140 140">${circles}</svg>`;
}
// Thai locale conventionally displays the Buddhist Era year (Gregorian + 543);
// dates/keys stay Gregorian internally, this only affects what's shown.
export function yearLabel(yyyy) { return String(displayYear(yyyy)); }
export function availableYears() {
  const years = new Set(transactions.map((t) => t.date.slice(0, 4)));
  years.add(String(new Date().getFullYear()));
  return Array.from(years).sort().reverse();
}
// "YYYY-MM" keys for every month that has at least one transaction, newest
// first, always including the current month so the month picker never
// starts empty on a fresh install.
export function availableMonthKeys() {
  const keys = new Set(transactions.map((t) => monthKey(t.date)));
  keys.add(localMonthKey());
  return Array.from(keys).sort().reverse();
}
export function computeTrend() {
  const byMonth = {};
  transactions.forEach((t) => { const k = monthKey(t.date); byMonth[k] = byMonth[k] || { income: 0, expense: 0 }; byMonth[k][t.type] += t.amount; });
  const keys = Object.keys(byMonth).sort().slice(-6);
  const max = Math.max(1, ...keys.map((k) => Math.max(byMonth[k].income, byMonth[k].expense)));
  return keys.map((k) => ({
    label: monthLabel(k),
    incomeH: Math.max(2, Math.round((byMonth[k].income / max) * 130)),
    expenseH: Math.max(2, Math.round((byMonth[k].expense / max) * 130))
  }));
}
// accountId: stage 5 of docs/specs/multi-account-support.md, optional --
// omitted (or null) means every account combined, matching every existing
// caller's behavior unchanged. Only home.js calls this, so this is a
// backward-compatible extension, not a breaking change.
export function monthTotal(key, type, accountId) {
  return transactions.filter((t) => t.type === type && monthKey(t.date) === key && (accountId == null || t.accountId === accountId)).reduce((a, t) => a + t.amount, 0);
}
// Whether any transaction of `type` falls in month `key` -- pass no type
// to check for any transaction at all that month. Used to tell "the prior
// period genuinely had no activity" apart from "the prior totals happen
// to sum to zero": income/expense sums are never negative, so a zero sum
// there really does mean no transactions, but balance (income - expense)
// very normally lands on exactly 0 in a month with real transactions on
// both sides, and that's not the same situation.
export function monthHasTransactions(key, type, accountId) {
  return transactions.some((t) => (!type || t.type === type) && monthKey(t.date) === key && (accountId == null || t.accountId === accountId));
}
// Returns null (render no comparison badge) rather than a percentage
// whenever there's nothing meaningful to compare against: either the
// prior period had no transactions at all (hasPriorData is false --
// comparing against zero used to render as a flat "+100%" on a brand-new
// user's very first month, which reads as "your spending is up 100%"
// with nothing to actually compare to), or prev is exactly 0 even with
// real prior-period activity (a genuine income-equals-expense tie),
// where a percentage change is a division by zero either way.
export function pctDeltaLabel(cur, prev, hasPriorData) {
  if (!hasPriorData || !prev) return null;
  const p = Math.round(((cur - prev) / prev) * 100);
  return (p >= 0 ? "+" : "") + p + "%";
}
export function prevMonthKey() {
  const now = new Date();
  let pm = now.getMonth() - 1, py = now.getFullYear();
  if (pm < 0) { pm = 11; py -= 1; }
  return py + "-" + String(pm + 1).padStart(2, "0");
}
// Running net balance per day (last 8 datapoints) for the home hero
// sparkline. accountId: stage 5 of docs/specs/multi-account-support.md,
// optional -- omitted (or null) means every account's transactions
// combined, matching prior behavior unchanged.
//
// Stage 1 of docs/specs/account-transfers.md: transfers are deliberately
// excluded entirely (not made transfer-aware like computeBalance) -- this
// is a decorative trend line, not a source of truth, so the simpler fix is
// applied here rather than threading from/to-account transfer math into a
// sparkline.
export function computeSparklinePoints(accountId) {
  const netByDay = {};
  transactions.slice().filter((t) => (t.type === "income" || t.type === "expense") && (accountId == null || t.accountId === accountId)).sort((a, b) => a.date.localeCompare(b.date)).forEach((t) => {
    netByDay[t.date] = (netByDay[t.date] || 0) + (t.type === "income" ? t.amount : -t.amount);
  });
  let running = 0;
  return Object.keys(netByDay).sort().map((d) => (running += netByDay[d])).slice(-8);
}
export function sparklineSvg(points, color, width, height, strokeWidth) {
  if (!points.length) return "";
  const max = Math.max(...points), min = Math.min(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1 || 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${height - ((p - min) / range) * height}`).join(" ");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
}
