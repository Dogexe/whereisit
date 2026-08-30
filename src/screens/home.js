import { L } from "../i18n.js";
import { state, transactions, bills, accounts } from "../state.js";
import { $, uid, escapeHtml, icon, iconAvatar, fmtMoney, refreshIcons, isDesktopShell, localDateIso, localMonthKey } from "../utils.js";
import { CATEGORIES } from "../categories.js";
import {
  byRecency, computeBudgets, upcomingBills, monthTotal, monthHasTransactions, pctDeltaLabel, prevMonthKey,
  sparklineSvg, computeSparklinePoints, dueSoonLabel, billDueCycle, checkBudgetAlert, defaultAccountId, computeBalance
} from "../derived.js";
import { saveToStorage, saveSettings } from "../storage.js";
import { pushTx, pushRows, syncNow, billToRow } from "../sync.js";
import { showToast } from "../toast.js";
import { setTab, renderScreen } from "./router.js";
import { resetForm, openAddSheet } from "./add.js";
import { groupedTxRowsHtml, wireTxRowActions } from "./tx-row.js";

// Shared by both of Home's own "add a transaction" shortcuts
// (goAddBtn/emptyAddBtn) -- docs/specs/add-transaction-bottom-sheet.md
// only updated the tab bar's own Add button and row Edit buttons at the
// time; these two were a real gap found later auditing for
// microinteractions, since they still navigated to the old full-page
// screen on mobile instead of opening the sheet like every other Add
// entry point now does.
function goAdd() {
  resetForm();
  if (isDesktopShell()) { setTab("add"); return; }
  openAddSheet();
}
// Only caller is renderHome's "mark paid" button -- kept here rather than
// derived.js since unlike that module's pure computations this mutates
// state, saves, renders, and syncs.
export function markBillPaid(id) {
  const bill = bills.find((b) => b.id === id);
  if (!bill) return;
  // Stage 4 of docs/specs/multi-account-support.md: this creates a
  // transaction under the hood exactly like the Add screen does, so it
  // needs a real accountId too. Home's currently-selected account when one
  // specific account is selected (not "All accounts"), else the same
  // most-recently-used fallback the Add screen defaults to.
  const accountId = (state.homeSelectedAccountId && accounts.some((a) => a.id === state.homeSelectedAccountId))
    ? state.homeSelectedAccountId
    : defaultAccountId();
  const savedTx = {
    id: uid(), type: "expense", date: localDateIso(),
    category: bill.category || CATEGORIES.expense[CATEGORIES.expense.length - 1], categoryId: bill.categoryId || null,
    accountId, amount: bill.amount, note: bill.name, updatedAt: Date.now()
  };
  transactions.push(savedTx);
  bill.lastPaidCycle = billDueCycle(bill);
  bill.updatedAt = Date.now();
  saveToStorage();
  saveSettings();
  renderScreen();
  showToast(checkBudgetAlert(savedTx) || L().toastAdded);
  Promise.all([pushTx(savedTx), pushRows("bills", [billToRow(bill, false)])]).then(() => syncNow());
}

// Stage 5 of docs/specs/multi-account-support.md: "All accounts" (null)
// plus each real account, including archived ones -- decision 8 keeps an
// archived account selectable/viewable in the switcher, just not as a
// target for new transactions (the Add screen's picker, stage 4).
function accountSwitcherHtml() {
  const l = L();
  const chips = [{ id: "", label: l.allAccountsOption }].concat(accounts.map((a) => ({ id: a.id, label: a.name })));
  const selected = state.homeSelectedAccountId || "";
  return `<div class="account-switcher-row">${chips.map((c) => `<button type="button" class="account-chip${c.id === selected ? " active" : ""}" data-account="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>`).join("")}</div>`;
}

export function renderHome() {
  const l = L();
  // Stage 5: hero balance, income/expense stat cards, spent-today, the
  // sparkline, and recent activity all scope to the selected account (or
  // combine across all accounts when "All accounts" is selected). Budgets
  // preview and upcoming bills deliberately do NOT scope -- see the spec's
  // "Decisions made without a direct question" section for why (budgets/
  // bills stay account-agnostic, tracked against every transaction
  // regardless of account, so this Home panel stays consistent with that
  // rather than silently filtering a global concept).
  const selectedId = state.homeSelectedAccountId;
  // Stage 3 of docs/specs/account-transfers.md: a transfer's own account
  // field is its *source* (t.accountId is the "from" side, t.toAccountId
  // the "to"), so viewing a specific account must match either side, not
  // just .accountId -- and viewing "All accounts" must exclude every
  // transfer outright (per the spec's confirmed decision, a transfer is
  // invisible in the combined view, not just net-zero in the balance).
  const scopedTx = selectedId
    ? transactions.filter((t) => t.type === "transfer" ? (t.accountId === selectedId || t.toAccountId === selectedId) : t.accountId === selectedId)
    : transactions.filter((t) => t.type !== "transfer");
  const income = scopedTx.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0);
  const expense = scopedTx.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0);
  const balance = computeBalance(selectedId);
  const recent = scopedTx.slice().sort(byRecency).slice(0, 5);
  const budgetsPreview = computeBudgets();
  const dueSoon = upcomingBills();
  const today = new Date().toLocaleDateString(state.lang === "en" ? "en-US" : "th-TH", { month: "long", year: "numeric" });

  const curM = localMonthKey();
  const prevM = prevMonthKey();
  const curIncome = monthTotal(curM, "income", selectedId), prevIncome = monthTotal(prevM, "income", selectedId);
  const curExpense = monthTotal(curM, "expense", selectedId), prevExpense = monthTotal(prevM, "expense", selectedId);
  const balanceDelta = pctDeltaLabel(curIncome - curExpense, prevIncome - prevExpense, monthHasTransactions(prevM, null, selectedId));
  const incomeDelta = pctDeltaLabel(curIncome, prevIncome, monthHasTransactions(prevM, "income", selectedId));
  const expenseDelta = pctDeltaLabel(curExpense, prevExpense, monthHasTransactions(prevM, "expense", selectedId));
  const sparkline = sparklineSvg(computeSparklinePoints(selectedId), "#ffffff", 150, 34, 2.5);
  const todayIso = localDateIso();
  const spentToday = scopedTx.filter((t) => t.type === "expense" && t.date === todayIso).reduce((a, t) => a + t.amount, 0);

  $("screen").innerHTML = `
    <div class="today-label">${escapeHtml(today)}</div>
    <h2 class="screen-title" style="margin:2px 0 0">${escapeHtml(l.overview)}</h2>
    <div class="home-columns">
      <div class="home-col-main">
        ${accountSwitcherHtml()}
        <div class="hero-card${balance < 0 ? " hero-card-negative" : ""}">
          <div class="kicker">${escapeHtml(l.balanceLabel)}</div>
          <div class="amount">${fmtMoney(balance)}</div>
          <div class="foot-row">
            ${sparkline}
            ${balanceDelta !== null ? `<div class="delta-pill">${escapeHtml(balanceDelta)}</div>` : ""}
          </div>
        </div>
        <div class="stat-row">
          <div class="stat-card">
            <div class="head">${icon("arrow-down-left")}<span>${escapeHtml(l.incomeLabel)}</span></div>
            <div class="value">${fmtMoney(income)}</div>
            <div class="delta" style="color:var(--color-income)">${incomeDelta !== null ? escapeHtml(incomeDelta) + " " + escapeHtml(l.vsLastMonth) : "—"}</div>
          </div>
          <div class="stat-card">
            <div class="head">${icon("arrow-up-right")}<span>${escapeHtml(l.expenseLabel)}</span></div>
            <div class="value">${fmtMoney(expense)}</div>
            <div class="delta" style="color:var(--color-expense)">${expenseDelta !== null ? escapeHtml(expenseDelta) + " " + escapeHtml(l.vsLastMonth) : "—"}</div>
          </div>
        </div>

        <div class="today-spend-card">
          ${iconAvatar("wallet", "var(--color-expense-tint)", "var(--color-expense-700)", "sm")}
          <span class="label">${escapeHtml(l.spentToday)}</span>
          <span class="value">${fmtMoney(spentToday)}</span>
        </div>

        <div class="section-head">
          <h3>${escapeHtml(l.recentTx)}</h3>
          <button type="button" class="btn btn-ghost" id="goAddBtn">${escapeHtml(l.addShort)}</button>
        </div>
        <div class="list-card">
          ${recent.length ? groupedTxRowsHtml(recent, selectedId) : `<div class="empty-note empty-note-search">${icon("receipt")}<div>${escapeHtml(l.noTransactionsYet)}</div><button type="button" class="btn btn-primary btn-sm" id="emptyAddBtn">${escapeHtml(l.addShort)}</button></div>`}
        </div>
      </div>
      <div class="home-col-side">
        ${dueSoon.length ? `
        <div class="section-head" style="margin-top:0">
          <h3>${escapeHtml(l.upcomingBillsSection)}</h3>
        </div>
        <div class="list-card">
          ${dueSoon.map((b) => {
            const overdue = b.daysUntil < 0;
            return `
            <div class="manage-row${overdue ? " manage-row-overdue" : ""}">
              ${iconAvatar("calendar-clock", overdue ? "var(--color-expense-tint)" : "var(--color-warning-tint)", overdue ? "var(--color-expense-700)" : "var(--color-warning-text)")}
              <div class="info">
                <div class="name">${escapeHtml(b.name)}</div>
                <div class="sub">${escapeHtml(dueSoonLabel(b.daysUntil))}</div>
              </div>
              <div class="amt">${fmtMoney(b.amount)}</div>
              <button type="button" class="btn btn-sm ${overdue ? "btn-danger" : "btn-secondary"}" data-mark-paid="${b.id}">${escapeHtml(l.markPaidBtn)}</button>
            </div>`;
          }).join("")}
        </div>` : ""}
        <div class="section-head" style="${dueSoon.length ? "" : "margin-top:0"}">
          <h3>${escapeHtml(l.budgetsThisMonth)}</h3>
          <button type="button" class="btn btn-ghost" id="goBudgetsBtn">${escapeHtml(l.seeAll)}</button>
        </div>
        <div class="card budgets-list">
          ${budgetsPreview.map((b) => `
            <div class="budget-item">
              <div class="row1"><span>${escapeHtml(b.category)}</span><span class="right">${b.spentFmt} / ${b.limitFmt}</span></div>
              <div class="bar-track"><div class="bar-fill" style="width:${b.pct}%;background:${b.barColor}"></div></div>
            </div>`).join("")}
        </div>
      </div>
    </div>
  `;
  document.querySelectorAll("[data-account]").forEach((btn) => btn.addEventListener("click", () => {
    const v = btn.getAttribute("data-account");
    state.homeSelectedAccountId = v === "" ? null : v;
    renderHome();
  }));
  $("goAddBtn").addEventListener("click", goAdd);
  $("goBudgetsBtn").addEventListener("click", () => { state.insightsTab = "budgets"; setTab("insights"); });
  const emptyAddBtn = document.getElementById("emptyAddBtn");
  if (emptyAddBtn) emptyAddBtn.addEventListener("click", goAdd);
  document.querySelectorAll("[data-mark-paid]").forEach((btn) => btn.addEventListener("click", () => markBillPaid(btn.getAttribute("data-mark-paid"))));
  wireTxRowActions();
  refreshIcons();
}
