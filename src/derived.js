import { state, transactions, budgets, bills } from "./state.js";
import { monthKey, fmtMoney, monthLabel, dateLabel, displayYear } from "./utils.js";
import { L } from "./i18n.js";

export function computeBudgets(forMonth) {
  const targetMonth = forMonth || new Date().toISOString().slice(0, 7);
  const spentByCategory = {};
  transactions.filter((t) => t.type === "expense" && monthKey(t.date) === targetMonth).forEach((t) => {
    spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount;
  });
  return budgets.map((b) => {
    const spent = spentByCategory[b.category] || 0;
    const pct = Math.min(100, Math.round((spent / b.limit) * 100));
    const over = spent > b.limit;
    const near = !over && spent / b.limit >= 0.8;
    return {
      category: b.category, spentFmt: fmtMoney(spent), limitFmt: fmtMoney(b.limit), pct,
      barColor: over ? "var(--color-expense)" : (near ? "var(--color-warning)" : "var(--color-accent)"),
      badgeClass: over ? "badge-expense" : (near ? "badge-warn" : "badge-brand"),
      statusLabel: over ? L().overBudget : pct + "%"
    };
  });
}
// Same shape as computeBudgets, but sums a whole year's spend per category
// and compares it against the monthly limit x12 (there's no separate yearly
// limit field -- budgets are defined as one monthly figure per category).
export function computeBudgetsForYear(forYear) {
  const targetYear = forYear || String(new Date().getFullYear());
  const spentByCategory = {};
  transactions.filter((t) => t.type === "expense" && t.date.slice(0, 4) === targetYear).forEach((t) => {
    spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount;
  });
  return budgets.map((b) => {
    const spent = spentByCategory[b.category] || 0;
    const yearLimit = b.limit * 12;
    const pct = Math.min(100, Math.round((spent / yearLimit) * 100));
    const over = spent > yearLimit;
    const near = !over && spent / yearLimit >= 0.8;
    return {
      category: b.category, spentFmt: fmtMoney(spent), limitFmt: fmtMoney(yearLimit), pct,
      barColor: over ? "var(--color-expense)" : (near ? "var(--color-warning)" : "var(--color-accent)"),
      badgeClass: over ? "badge-expense" : (near ? "badge-warn" : "badge-brand"),
      statusLabel: over ? L().overBudget : pct + "%"
    };
  });
}
// Returns an alert message if adding/editing `tx` pushed its budget category
// to 80%+ of its monthly limit, or null if no budget applies / still under.
export function checkBudgetAlert(tx) {
  if (!tx || tx.type !== "expense") return null;
  const curMonthKey = new Date().toISOString().slice(0, 7);
  if (monthKey(tx.date) !== curMonthKey) return null;
  const budget = budgets.find((b) => b.category === tx.category);
  if (!budget) return null;
  const spent = transactions.filter((t) => t.type === "expense" && t.category === tx.category && monthKey(t.date) === curMonthKey).reduce((a, t) => a + t.amount, 0);
  if (spent >= budget.limit) return L().toastBudgetOver.replace("{cat}", tx.category);
  if (spent / budget.limit >= 0.8) return L().toastBudgetNear.replace("{cat}", tx.category);
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
// Splits an already-sorted (byRecency) transaction list into consecutive
// same-date runs, each labeled "Today"/"Yesterday" or the plain date. Does
// not itself sort or filter -- callers pass in whatever order they want
// preserved within and across groups.
export function groupByDate(txs) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);
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
export function monthKeyOf(date) { return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0"); }
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
export function computeBreakdown(forMonth) {
  const targetMonth = forMonth || new Date().toISOString().slice(0, 7);
  const totals = {};
  transactions.filter((t) => t.type === "expense" && monthKey(t.date) === targetMonth).forEach((t) => {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  });
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = entries.length ? entries[0][1] : 1;
  const sum = entries.reduce((a, [, v]) => a + v, 0) || 1;
  return entries.map(([cat, total], i) => ({
    category: cat, total, totalFmt: fmtMoney(total),
    pct: Math.max(4, Math.round((total / max) * 100)),
    sharePct: (total / sum) * 100,
    color: CHART_COLORS[i % CHART_COLORS.length]
  }));
}
// Same shape as computeBreakdown, but sums a whole year's spend per category.
export function computeBreakdownForYear(forYear) {
  const targetYear = forYear || String(new Date().getFullYear());
  const totals = {};
  transactions.filter((t) => t.type === "expense" && t.date.slice(0, 4) === targetYear).forEach((t) => {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  });
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = entries.length ? entries[0][1] : 1;
  const sum = entries.reduce((a, [, v]) => a + v, 0) || 1;
  return entries.map(([cat, total], i) => ({
    category: cat, total, totalFmt: fmtMoney(total),
    pct: Math.max(4, Math.round((total / max) * 100)),
    sharePct: (total / sum) * 100,
    color: CHART_COLORS[i % CHART_COLORS.length]
  }));
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
  keys.add(monthKey(new Date().toISOString()));
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
export function monthTotal(key, type) {
  return transactions.filter((t) => t.type === type && monthKey(t.date) === key).reduce((a, t) => a + t.amount, 0);
}
// Whether any transaction of `type` falls in month `key` -- pass no type
// to check for any transaction at all that month. Used to tell "the prior
// period genuinely had no activity" apart from "the prior totals happen
// to sum to zero": income/expense sums are never negative, so a zero sum
// there really does mean no transactions, but balance (income - expense)
// very normally lands on exactly 0 in a month with real transactions on
// both sides, and that's not the same situation.
export function monthHasTransactions(key, type) {
  return transactions.some((t) => (!type || t.type === type) && monthKey(t.date) === key);
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
// Running net balance per day (last 8 datapoints) for the home hero sparkline.
export function computeSparklinePoints() {
  const netByDay = {};
  transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((t) => {
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
