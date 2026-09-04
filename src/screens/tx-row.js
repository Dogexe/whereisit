import { iconFor, rowTone, categoryDisplayName } from "../categories.js";
import { accountNameById } from "../accounts.js";
import { iconAvatar, escapeHtml, fmtMoney, dateLabel, EDIT_ICON, DELETE_ICON } from "../utils.js";
import { groupByDate, resolveCategoryId } from "../derived.js";
import { categories, accounts } from "../state.js";
import { editTx, deleteTx } from "./add.js";
import { L } from "../i18n.js";

const REVEAL = 88; // exactly the actions group's width: 12+30+4+30+12
const PEEK_KEY = "expense_tracker_swipe_peek_shown_v1";

// Stage 5 of docs/specs/custom-categories.md: the last two display
// touchpoints still reading the old string-keyed model, alongside
// transactions.js's filter dropdown. Both name and icon now resolve
// through the live category record (falling back to the row's own
// stored .category string / the old iconFor() map for anything that
// still can't be matched), so a rename or icon edit shows up here too --
// this row previously kept showing a stale name/icon after either.
// Stage 3 of docs/specs/account-transfers.md: a transfer renders as a
// neutral, direction-labeled row ("Cash → Bank") -- no +/- sign or
// income/expense coloring -- everywhere EXCEPT when a caller explicitly
// passes viewingAccountId (Home only, the one place that always resolves
// to a single account-or-"all" context) and the transfer touches that
// account: then it renders signed relative to it, matching every other
// row on Home. The Transactions list never passes this param, per the
// spec's confirmed decision, so a transfer there is always the neutral
// form regardless of any active account filter.
function txRowHtml(t, viewingAccountId) {
  if (t.type === "transfer") {
    const l = L();
    const tone = rowTone(t.type);
    const viewingFrom = viewingAccountId != null && t.accountId === viewingAccountId;
    const viewingTo = viewingAccountId != null && t.toAccountId === viewingAccountId;
    let label, sign, amountColor;
    if (viewingFrom) {
      label = l.transferToRowLabel.replace("{name}", accountNameById(accounts, t.toAccountId, t.toAccountId));
      sign = "−"; amountColor = "var(--color-text)";
    } else if (viewingTo) {
      label = l.transferFromRowLabel.replace("{name}", accountNameById(accounts, t.accountId, t.accountId));
      sign = "+"; amountColor = "var(--color-income-700)";
    } else {
      const fromName = accountNameById(accounts, t.accountId, t.accountId);
      const toName = accountNameById(accounts, t.toAccountId, t.toAccountId);
      label = `${fromName} → ${toName}`;
      sign = ""; amountColor = "var(--color-text)";
    }
    return `
    <div class="tx-row-wrap" data-id="${t.id}">
      <div class="tx-date-cell">${escapeHtml(dateLabel(t.date))}</div>
      <div class="tx-row-inner">
        <div class="tx-lead">
          ${iconAvatar("arrow-right-left", tone.bg, tone.color)}
          <div class="info">
            <div class="cat">${escapeHtml(label)}</div>
            ${t.note ? `<div class="meta">${escapeHtml(t.note)}</div>` : ""}
          </div>
        </div>
        <div class="tx-trail-group">
          <div class="tx-trail">
            <div class="amt" style="color:${amountColor}">${sign}${fmtMoney(t.amount)}</div>
          </div>
          <div class="tx-row-actions">
            <button type="button" class="btn btn-icon" data-edit="${t.id}" aria-label="${escapeHtml(L().editAria)}">${EDIT_ICON}</button>
            <button type="button" class="btn btn-icon" style="color:var(--color-expense-700)" data-delete="${t.id}" aria-label="${escapeHtml(L().deleteAria)}">${DELETE_ICON}</button>
          </div>
        </div>
      </div>
    </div>`;
  }
  const tone = rowTone(t.type);
  const amountColor = t.type === "income" ? "var(--color-income-700)" : "var(--color-text)";
  const sign = t.type === "income" ? "+" : "−";
  const catId = resolveCategoryId(t, t.type);
  const cat = categories.find((c) => c.id === catId);
  const catName = categoryDisplayName(categories, catId, t.category);
  const iconName = cat ? cat.icon : iconFor(t.category);
  return `
    <div class="tx-row-wrap" data-id="${t.id}">
      <div class="tx-date-cell">${escapeHtml(dateLabel(t.date))}</div>
      <div class="tx-row-inner">
        <div class="tx-lead">
          ${iconAvatar(iconName, tone.bg, tone.color)}
          <div class="info">
            <div class="cat">${escapeHtml(catName)}</div>
            ${t.note ? `<div class="meta">${escapeHtml(t.note)}</div>` : ""}
          </div>
        </div>
        <div class="tx-trail-group">
          <div class="tx-trail">
            <div class="amt" style="color:${amountColor}">${sign}${fmtMoney(t.amount)}</div>
          </div>
          <div class="tx-row-actions">
            <button type="button" class="btn btn-icon" data-edit="${t.id}" aria-label="${escapeHtml(L().editAria)}">${EDIT_ICON}</button>
            <button type="button" class="btn btn-icon" style="color:var(--color-expense-700)" data-delete="${t.id}" aria-label="${escapeHtml(L().deleteAria)}">${DELETE_ICON}</button>
          </div>
        </div>
      </div>
    </div>`;
}
// Renders an already-sorted (byRecency) transaction list as consecutive
// date-header + row groups. Shared by Home's Recent Activity and the
// Transactions screen so both stay visually consistent. viewingAccountId
// (stage 3 of docs/specs/account-transfers.md) is optional and passed
// straight through to txRowHtml -- only Home ever supplies it.
export function groupedTxRowsHtml(txs, viewingAccountId) {
  return groupByDate(txs).map((g) => `
    <div class="tx-date-group">${escapeHtml(g.label)}</div>
    ${g.items.map((t) => txRowHtml(t, viewingAccountId)).join("")}`).join("");
}

// .tx-trail-group (amount + Edit/Delete) reveals by expanding its own
// width from "just the amount" to "amount + REVEAL", not by sliding --
// see the CSS comment on .tx-trail-group for why: it's what lets
// .tx-lead reclaim the full row width at rest instead of always
// reserving room for actions it isn't showing.
let openRow = null;
function closeRow(rowEl) {
  const group = rowEl.querySelector(".tx-trail-group");
  const base = parseFloat(rowEl.dataset.trailWidth || "0");
  if (group) group.style.width = base + "px";
  rowEl.dataset.open = "0";
  if (openRow === rowEl) openRow = null;
}
function openRowTo(rowEl) {
  if (openRow && openRow !== rowEl) closeRow(openRow);
  const base = parseFloat(rowEl.dataset.trailWidth || "0");
  rowEl.querySelector(".tx-trail-group").style.width = (base + REVEAL) + "px";
  rowEl.dataset.open = "1";
  openRow = rowEl;
}

export function wireTxRowActions() {
  document.querySelectorAll(".tx-row-wrap").forEach((rowEl) => {
    const group = rowEl.querySelector(".tx-trail-group");
    const handle = rowEl.querySelector(".tx-trail"); // drag surface is just the amount, so it never fights Edit/Delete's own clicks
    // Measured once, before any drag/width override -- the amount's own
    // natural width, so the group can start at exactly that (no reserved
    // dead space for actions) and only grow by REVEAL when opened.
    const naturalWidth = handle.getBoundingClientRect().width;
    rowEl.dataset.trailWidth = String(naturalWidth);
    group.style.width = naturalWidth + "px";
    let dragging = false, startX = 0, startOffset = 0, moved = false;

    handle.addEventListener("pointerdown", (e) => {
      dragging = true; moved = false;
      startX = e.clientX;
      startOffset = rowEl.dataset.open === "1" ? REVEAL : 0;
      group.classList.add("dragging");
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const delta = startX - e.clientX; // dragging left grows the reveal
      if (Math.abs(delta) > 4) moved = true;
      const raw = startOffset + delta;
      let clamped;
      if (raw < 0) clamped = -Math.sqrt(-raw) * 2;
      else if (raw > REVEAL) clamped = REVEAL + Math.sqrt(raw - REVEAL) * 2;
      else clamped = raw;
      group.style.width = (naturalWidth + clamped) + "px";
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      group.classList.remove("dragging");
      const delta = startX - (e.clientX || 0);
      const finalOffset = startOffset + delta;
      if (!moved && rowEl.dataset.open === "1") { closeRow(rowEl); return; }
      if (finalOffset > REVEAL / 2) openRowTo(rowEl); else closeRow(rowEl);
    }
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);

    // desktop hover fallback (mouse only, so real touch swiping is untouched)
    rowEl.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse" || dragging) return;
      openRowTo(rowEl);
    });
    rowEl.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "mouse" || dragging) return;
      closeRow(rowEl);
    });
  });
  document.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => editTx(btn.getAttribute("data-edit"))));
  document.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => deleteTx(btn.getAttribute("data-delete"))));
  maybeShowSwipePeek();
}

// Runs once ever (gated on a localStorage flag, not per-render) so a
// first-time user discovers the swipe gesture without documentation --
// opens the first row to REVEAL width, holds briefly, then closes it.
function maybeShowSwipePeek() {
  if (localStorage.getItem(PEEK_KEY)) return;
  const firstRow = document.querySelector(".tx-row-wrap");
  if (!firstRow) return;
  localStorage.setItem(PEEK_KEY, "1");
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  requestAnimationFrame(() => {
    openRowTo(firstRow);
    setTimeout(() => closeRow(firstRow), 400);
  });
}
