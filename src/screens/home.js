import { L } from "../i18n.js";
import { state, transactions, bills, accounts } from "../state.js";
import { $, uid, escapeHtml, icon, iconAvatar, fmtMoney, isDesktopShell, localDateIso, localMonthKey } from "../utils.js";
import { CATEGORIES } from "../categories.js";
import {
  byRecency, computeBudgets, upcomingBills, monthTotal, monthHasTransactions, pctDeltaLabel, prevMonthKey,
  sparklineSvg, computeSparklinePoints, dueSoonLabel, billDueCycle, checkBudgetAlert, defaultAccountId, computeBalance
} from "../derived.js";
import { saveToStorage, saveSettings } from "../storage.js";
import { pushTx, pushRows, syncNow, billToRow, currentUser } from "../sync.js";
import { accountDisplayName } from "../account.js";
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

const HERO_DOTS_HIDE_MS = 1500;
let heroDotsTimer;

function showHeroDots(autoHide = false) {
  clearTimeout(heroDotsTimer);
  const dots = document.querySelector(".hero-dots");
  if (!dots) return;
  dots.classList.add("visible");
  if (autoHide) heroDotsTimer = setTimeout(() => dots.classList.remove("visible"), HERO_DOTS_HIDE_MS);
}

function heroPages(l, curM, prevM) {
  return [{ id: null, label: l.allAccountsOption, kicker: l.totalBalanceLabel }]
    .concat(accounts.map((account) => ({ id: account.id, label: account.name, kicker: account.name })))
    .map((page) => {
      const curIncome = monthTotal(curM, "income", page.id);
      const prevIncome = monthTotal(prevM, "income", page.id);
      const curExpense = monthTotal(curM, "expense", page.id);
      const prevExpense = monthTotal(prevM, "expense", page.id);
      return {
        ...page, curIncome, prevIncome, curExpense, prevExpense,
        balance: computeBalance(page.id),
        balanceDelta: pctDeltaLabel(curIncome - curExpense, prevIncome - prevExpense, monthHasTransactions(prevM, null, page.id)),
        sparkline: sparklineSvg(computeSparklinePoints(page.id), "#ffffff", 150, 34, 2.5)
      };
    });
}

function wireHeroCarousel(pages, selectedIndex) {
  const card = document.querySelector(".hero-card");
  const track = card?.querySelector(".hero-carousel-track");
  if (!card || !track) return;

  const selectPage = (index) => {
    if (index < 0 || index >= pages.length || index === selectedIndex) return showHeroDots(true);
    state.homeSelectedAccountId = pages[index].id;
    renderHome();
    const indicator = document.querySelector(".hero-dot-indicator");
    if (indicator) {
      indicator.style.setProperty("--hero-dot-index", selectedIndex);
      indicator.getBoundingClientRect();
      indicator.style.setProperty("--hero-dot-index", index);
    }
    showHeroDots(true);
  };

  card.querySelector(".hero-arrow-prev")?.addEventListener("click", () => selectPage(selectedIndex - 1));
  card.querySelector(".hero-arrow-next")?.addEventListener("click", () => selectPage(selectedIndex + 1));
  card.querySelectorAll(".hero-dot").forEach((dot) => {
    dot.addEventListener("pointerdown", () => showHeroDots());
    dot.addEventListener("focus", () => showHeroDots());
    dot.addEventListener("click", () => selectPage(Number(dot.dataset.heroPage)));
  });

  let dragging = false, startX = 0, dragOffset = 0, moved = false;
  const resetTrack = () => { track.style.transform = `translateX(${-selectedIndex * 100}%)`; };
  card.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || event.target.closest("button")) return;
    dragging = true; moved = false; startX = event.clientX; dragOffset = 0;
    track.classList.add("dragging");
    showHeroDots();
    try { card.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
  });
  card.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const raw = event.clientX - startX;
    moved ||= Math.abs(raw) > 4;
    const pastEdge = (selectedIndex === 0 && raw > 0) || (selectedIndex === pages.length - 1 && raw < 0);
    dragOffset = pastEdge ? Math.sign(raw) * Math.sqrt(Math.abs(raw)) * 4 : raw;
    track.style.transform = `translateX(calc(${-selectedIndex * 100}% + ${dragOffset}px))`;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    track.classList.remove("dragging");
    const threshold = card.getBoundingClientRect().width / 2;
    if (moved && Math.abs(dragOffset) > threshold) return selectPage(selectedIndex + (dragOffset < 0 ? 1 : -1));
    resetTrack();
    showHeroDots(true);
  };
  card.addEventListener("pointerup", endDrag);
  card.addEventListener("pointercancel", endDrag);
}

export function renderHome() {
  const l = L();
  const curM = localMonthKey();
  const prevM = prevMonthKey();
  const pages = heroPages(l, curM, prevM);
  const selectedIndex = Math.max(0, pages.findIndex((page) => page.id === state.homeSelectedAccountId));
  const selectedPage = pages[selectedIndex];
  // Stage 5: hero balance, income/expense stat cards, spent-today, the
  // sparkline, and recent activity all scope to the selected account (or
  // combine across all accounts when "All accounts" is selected). Budgets
  // preview and upcoming bills deliberately do NOT scope -- see the spec's
  // "Decisions made without a direct question" section for why (budgets/
  // bills stay account-agnostic, tracked against every transaction
  // regardless of account, so this Home panel stays consistent with that
  // rather than silently filtering a global concept).
  const selectedId = selectedPage.id;
  // Stage 3 of docs/specs/account-transfers.md: a transfer's own account
  // field is its *source* (t.accountId is the "from" side, t.toAccountId
  // the "to"), so viewing a specific account must match either side, not
  // just .accountId -- and viewing "All accounts" must exclude every
  // transfer outright (per the spec's confirmed decision, a transfer is
  // invisible in the combined view, not just net-zero in the balance).
  const scopedTx = selectedId
    ? transactions.filter((t) => t.type === "transfer" ? (t.accountId === selectedId || t.toAccountId === selectedId) : t.accountId === selectedId)
    : transactions.filter((t) => t.type !== "transfer");
  const balance = selectedPage.balance;
  const recent = scopedTx.slice().sort(byRecency).slice(0, 5);
  const budgetsPreview = computeBudgets();
  const dueSoon = upcomingBills();
  const now = new Date();
  const today = now.toLocaleDateString(state.lang === "en" ? "en-US" : "th-TH", { month: "long", year: "numeric" });

  const { curIncome, prevIncome, curExpense, prevExpense } = selectedPage;
  const incomeDelta = pctDeltaLabel(curIncome, prevIncome, monthHasTransactions(prevM, "income", selectedId));
  const expenseDelta = pctDeltaLabel(curExpense, prevExpense, monthHasTransactions(prevM, "expense", selectedId));
  const todayIso = localDateIso();
  const spentToday = scopedTx.filter((t) => t.type === "expense" && t.date === todayIso).reduce((a, t) => a + t.amount, 0);

  const profileMeta = currentUser ? (currentUser.user_metadata || {}) : {};
  const profileAvatarUrl = profileMeta.avatar_url || profileMeta.picture || "";
  const profileName = accountDisplayName(currentUser, l.notSignedIn);
  const greetingOptions = now.getHours() >= 5 && now.getHours() < 12
    ? [l.greetingMorning, l.greetingMorningAlt]
    : now.getHours() < 18
      ? [l.greetingAfternoon, l.greetingAfternoonAlt]
      : [l.greetingEvening, l.greetingEveningAlt];
  const greeting = `${greetingOptions[Math.floor(Math.random() * greetingOptions.length)]}${currentUser && profileName ? `, ${profileName}` : ""}`;
  const profileInner = profileAvatarUrl
    ? `<img src="${escapeHtml(profileAvatarUrl)}" alt="">`
    : (currentUser ? escapeHtml((profileName || "?").slice(0, 1).toUpperCase()) : icon("user"));

  $("screen").innerHTML = `
    <div class="home-header-row">
      <div>
        <div class="today-label">${escapeHtml(greeting)}</div>
        <h2 class="screen-title" style="margin:2px 0 var(--space-sm)">${escapeHtml(today)}</h2>
      </div>
      <button type="button" class="home-profile-btn" id="homeProfileBtn" aria-label="${escapeHtml(l.profileAria)}">${profileInner}</button>
    </div>
    <div class="home-columns">
      <div class="home-col-main">
        <div class="hero-card${balance < 0 ? " hero-card-negative" : ""}" data-hero-index="${selectedIndex}">
          <div class="hero-carousel-viewport">
            <div class="hero-carousel-track" style="transform:translateX(${-selectedIndex * 100}%)">
              ${pages.map((page, index) => `
              <section class="hero-page" data-hero-page="${index}"${index === selectedIndex ? "" : ' aria-hidden="true" inert'}>
                <div class="kicker-row">
                  <div class="kicker">${escapeHtml(page.kicker)}</div>
                  <button type="button" class="hero-hide-btn"${index === selectedIndex ? ' id="hideAmountsBtn"' : ""} aria-label="${escapeHtml(state.hideAmounts ? l.showAmountsAria : l.hideAmountsAria)}">${icon(state.hideAmounts ? "eye-off" : "eye", 'width="16" height="16"')}</button>
                </div>
                <div class="amount">${fmtMoney(page.balance)}</div>
                <div class="foot-row">
                  ${page.sparkline}
                  ${page.balanceDelta !== null ? `<div class="delta-pill">${escapeHtml(page.balanceDelta)}</div>` : ""}
                </div>
              </section>`).join("")}
            </div>
          </div>
          ${pages.length > 1 ? `<div class="hero-dots"><span class="hero-dot-indicator" style="--hero-dot-index:${selectedIndex}" aria-hidden="true"></span>${pages.map((page, index) => `<button type="button" class="hero-dot" data-hero-page="${index}" aria-label="${escapeHtml(page.label)}"${index === selectedIndex ? ' aria-current="true"' : ""}></button>`).join("")}</div>` : ""}
          <button type="button" class="btn btn-icon hero-arrow hero-arrow-prev" aria-label="${escapeHtml(l.prevAria)}"${selectedIndex === 0 ? " disabled" : ""}>${icon("chevron-left")}</button>
          <button type="button" class="btn btn-icon hero-arrow hero-arrow-next" aria-label="${escapeHtml(l.nextAria)}"${selectedIndex === pages.length - 1 ? " disabled" : ""}>${icon("chevron-right")}</button>
        </div>
        <div class="stat-row">
          <div class="stat-card">
            <div class="head">${icon("arrow-down-left")}<span>${escapeHtml(l.incomeLabel)}</span></div>
            <div class="value">${fmtMoney(curIncome)}</div>
            <div class="delta" style="color:var(--color-income-700)">${incomeDelta !== null ? escapeHtml(incomeDelta) : "—"}</div>
          </div>
          <div class="stat-card">
            <div class="head">${icon("arrow-up-right")}<span>${escapeHtml(l.expenseLabel)}</span></div>
            <div class="value">${fmtMoney(curExpense)}</div>
            <div class="delta" style="color:var(--color-expense-700)">${expenseDelta !== null ? escapeHtml(expenseDelta) : "—"}</div>
          </div>
        </div>

        <div class="today-spend-card">
          ${iconAvatar("wallet", "var(--color-expense-tint)", "var(--color-expense-700)", "sm")}
          <span class="label">${escapeHtml(l.spentToday)}</span>
          <span class="value">${fmtMoney(spentToday)}</span>
        </div>

        <div class="section-head">
          <h3>${escapeHtml(l.recentTx)}</h3>
          <button type="button" class="btn btn-ghost" id="goRecentSeeAllBtn">${escapeHtml(l.seeAll)}</button>
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
  wireHeroCarousel(pages, selectedIndex);
  $("hideAmountsBtn").addEventListener("click", () => { state.hideAmounts = !state.hideAmounts; saveSettings(); renderScreen(); });
  $("homeProfileBtn").addEventListener("click", () => setTab("settings"));
  $("goRecentSeeAllBtn").addEventListener("click", () => setTab("transactions"));
  $("goBudgetsBtn").addEventListener("click", () => { state.insightsTab = "budgets"; setTab("insights"); });
  const emptyAddBtn = document.getElementById("emptyAddBtn");
  if (emptyAddBtn) emptyAddBtn.addEventListener("click", goAdd);
  document.querySelectorAll("[data-mark-paid]").forEach((btn) => btn.addEventListener("click", () => markBillPaid(btn.getAttribute("data-mark-paid"))));
  wireTxRowActions();
}
