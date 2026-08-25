import { iconFor, rowTone } from "../categories.js";
import { iconAvatar, escapeHtml, fmtMoney, EDIT_ICON, DELETE_ICON } from "../utils.js";
import { groupByDate } from "../derived.js";
import { editTx, deleteTx } from "./add.js";
import { L } from "../i18n.js";

const REVEAL = 88; // exactly the actions group's width: 12+30+4+30+12

export function txRowHtml(t) {
  const tone = rowTone(t.type);
  const amountColor = t.type === "income" ? "var(--color-income)" : "var(--color-text)";
  const sign = t.type === "income" ? "+" : "−";
  return `
    <div class="tx-row-wrap" data-id="${t.id}">
      <div class="tx-row-inner">
        <div class="tx-lead">
          ${iconAvatar(iconFor(t.category), tone.bg, tone.color)}
          <div class="info">
            <div class="cat">${escapeHtml(t.category)}</div>
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
// Transactions screen so both stay visually consistent.
export function groupedTxRowsHtml(txs) {
  return groupByDate(txs).map((g) => `
    <div class="tx-date-group">${escapeHtml(g.label)}</div>
    ${g.items.map((t) => txRowHtml(t)).join("")}`).join("");
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
}
