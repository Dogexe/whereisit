import { iconFor, rowTone, categoryDisplayName } from "../categories.js";
import { accountNameById } from "../accounts.js";
import { iconAvatar, escapeHtml, fmtMoney, dateLabel, EDIT_ICON, DELETE_ICON } from "../utils.js";
import { groupByDate, resolveCategoryId } from "../derived.js";
import { categories, accounts } from "../state.js";
import { editTx, deleteTx } from "./add.js";
import { L } from "../i18n.js";

const REVEAL = 96; // 12px padding + 40px action + 4px gap + 40px action + 0px padding (flush with the row edge, matching the amount's own right-side spacing)
const DELETE_COMMIT_RATIO = 0.65;
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
        </div>
      </div>
      <div class="tx-row-actions">
        <button type="button" class="btn btn-icon tx-swipe-action tx-swipe-edit" data-edit="${t.id}" aria-label="${escapeHtml(L().editAria)}">${EDIT_ICON}</button>
        <button type="button" class="btn btn-icon tx-swipe-action tx-swipe-delete" data-delete="${t.id}" aria-label="${escapeHtml(L().deleteAria)}">${DELETE_ICON}</button>
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
        </div>
      </div>
      <div class="tx-row-actions">
        <button type="button" class="btn btn-icon tx-swipe-action tx-swipe-edit" data-edit="${t.id}" aria-label="${escapeHtml(L().editAria)}">${EDIT_ICON}</button>
        <button type="button" class="btn btn-icon tx-swipe-action tx-swipe-delete" data-delete="${t.id}" aria-label="${escapeHtml(L().deleteAria)}">${DELETE_ICON}</button>
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

let openRow = null;
function setRevealOffset(rowEl, offset) {
  const inner = rowEl.querySelector(".tx-row-inner");
  const actions = rowEl.querySelector(".tx-row-actions");
  const swipeButtons = rowEl.querySelectorAll(".tx-swipe-action");
  const deleteButton = rowEl.querySelector("[data-delete]");
  if (!actions) {
    if (inner) inner.style.transform = `translateX(${-offset}px)`;
    return;
  }
  // Each action begins its pop-in only when the translated row has uncovered
  // that action's own slot. This keeps Edit from silently scaling up behind
  // the opaque content layer and then appearing already large.
  const isStaticActionColumn = getComputedStyle(actions).position === "static";
  swipeButtons.forEach((button) => {
    const revealStart = parseFloat(button.dataset.revealStart || "0");
    const revealEnd = parseFloat(button.dataset.revealEnd || String(REVEAL));
    const localProgress = Math.max(0, Math.min(1, (offset - revealStart) / (revealEnd - revealStart)));
    button.style.transform = isStaticActionColumn ? "" : `scale(${localProgress})`;
  });
  const fullSwipe = offset > REVEAL && !isStaticActionColumn;
  actions.classList.toggle("full-swipe", fullSwipe);
  if (!fullSwipe || !deleteButton) {
    if (inner) inner.style.transform = `translateX(${-offset}px)`;
    if (deleteButton) {
      deleteButton.style.width = "";
      deleteButton.style.height = "";
      deleteButton.style.right = "";
      deleteButton.style.top = "";
    }
    return;
  }
  const commitThreshold = parseFloat(rowEl.dataset.deleteCommitThreshold || "0");
  const rowWidth = parseFloat(rowEl.dataset.rowWidth || "0");
  const rowHeight = parseFloat(rowEl.dataset.rowHeight || "0");
  const fullSwipeMargin = parseFloat(getComputedStyle(rowEl).getPropertyValue("--space-xs")) || 8;
  const progress = Math.min(1, (offset - REVEAL) / (commitThreshold - REVEAL));
  const maxWidth = rowWidth - fullSwipeMargin * 2;
  const maxHeight = rowHeight - fullSwipeMargin * 2;
  const width = 40 + (maxWidth - 40) * progress;
  const height = 40 + (maxHeight - 40) * progress;
  const right = fullSwipeMargin * progress;
  // Clear the whole row beneath the inset bar, including its leading margin.
  // REVEAL remains the continuous phase-boundary floor.
  const revealOffset = Math.max(REVEAL, width + right + fullSwipeMargin);
  if (inner) inner.style.transform = `translateX(${-revealOffset}px)`;
  deleteButton.style.width = width + "px";
  deleteButton.style.height = height + "px";
  deleteButton.style.right = right + "px";
  deleteButton.style.top = ((rowHeight - height) / 2) + "px";
}
function closeRow(rowEl) {
  setRevealOffset(rowEl, 0);
  rowEl.dataset.open = "0";
  if (openRow === rowEl) openRow = null;
}
function openRowTo(rowEl) {
  if (openRow && openRow !== rowEl) closeRow(openRow);
  setRevealOffset(rowEl, REVEAL);
  rowEl.dataset.open = "1";
  openRow = rowEl;
}

export function wireTxRowActions() {
  document.querySelectorAll(".tx-row-wrap").forEach((rowEl) => {
    const inner = rowEl.querySelector(".tx-row-inner");
    const rowRect = rowEl.getBoundingClientRect();
    const deleteCommitThreshold = rowRect.width * DELETE_COMMIT_RATIO;
    rowEl.dataset.deleteCommitThreshold = String(deleteCommitThreshold);
    rowEl.dataset.rowWidth = String(rowRect.width);
    rowEl.dataset.rowHeight = String(rowRect.height);
    const actions = rowEl.querySelector(".tx-row-actions");
    actions?.querySelectorAll(".tx-swipe-action").forEach((button) => {
      // offsetLeft is measured from the actions panel's left edge; convert it
      // to the reveal distance measured inward from the row's right edge.
      button.dataset.revealStart = String(actions.clientWidth - (button.offsetLeft + button.offsetWidth));
      button.dataset.revealEnd = String(actions.clientWidth - button.offsetLeft);
    });
    let dragging = false, startX = 0, startOffset = 0, moved = false;

    rowEl.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".tx-row-actions")) return;
      dragging = true; moved = false;
      startX = e.clientX;
      startOffset = rowEl.dataset.open === "1" ? REVEAL : 0;
      inner.classList.add("dragging");
      rowEl.querySelector(".tx-row-actions")?.classList.add("dragging");
      rowEl.setPointerCapture(e.pointerId);
    });
    rowEl.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const delta = startX - e.clientX; // dragging left grows the reveal
      if (Math.abs(delta) > 4) moved = true;
      const raw = startOffset + delta;
      const clamped = raw < 0 ? -Math.sqrt(-raw) * 2 : raw;
      setRevealOffset(rowEl, clamped);
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      inner.classList.remove("dragging");
      rowEl.querySelector(".tx-row-actions")?.classList.remove("dragging");
      const delta = startX - (e.clientX || 0);
      const finalOffset = startOffset + delta;
      if (finalOffset > deleteCommitThreshold) {
        deleteTx(rowEl.dataset.id);
        return;
      }
      if (!moved && rowEl.dataset.open === "1") { closeRow(rowEl); return; }
      if (finalOffset > REVEAL / 2) openRowTo(rowEl); else closeRow(rowEl);
    }
    rowEl.addEventListener("pointerup", endDrag);
    rowEl.addEventListener("pointercancel", () => {
      if (!dragging) return;
      dragging = false;
      inner.classList.remove("dragging");
      rowEl.querySelector(".tx-row-actions")?.classList.remove("dragging");
      if (startOffset > REVEAL / 2) openRowTo(rowEl); else closeRow(rowEl);
    });

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
