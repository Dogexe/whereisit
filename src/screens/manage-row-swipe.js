// docs/specs/settings-manage-swipe-and-sheet.md: mobile-only (<1024px)
// swipe-to-reveal for Settings' Manage rows (Budgets/Bills/Categories/
// Accounts/Goals). A sibling implementation to tx-row.js's swipe, not a
// shared import -- the drag surface and button count genuinely differ
// (see the spec's own "why a new module" decision), but the reveal is
// done the same proven way tx-row.js already validated: growing a real
// flex box's width, never an overlaying positioned layer, specifically to
// avoid the exact stacking/hit-testing bugs tx-row.js's own history
// documents from its first two revisions.
//
// Simpler than tx-row.js's mechanism: .manage-row-content is flex:1 with
// no fixed natural-width baseline to measure (tx-row.js needs one because
// its .tx-lead sibling needs to reclaim exactly the amount's own width).
// Here the content column absorbs any width change by truncating its own
// text, the same way it already does at a narrow viewport -- so open/
// closed is just toggling .manage-row-actions-group between width:0 and
// width:<reveal>px, no measurement step needed.
// contentClass defaults to "manage-row" (every list-row caller); Goals'
// card-shaped context (docs/specs/settings-manage-swipe-and-sheet.md
// stage covering it) passes "goal-card-top-content" instead, since a
// goal card is its own self-contained box -- it doesn't want .manage-row's
// divider/padding baked in, only the icon+info+badge's own flex layout.
export function manageSwipeWrapHtml(id, contentHtml, actionsHtml, actionCount, contentClass, wrapClass) {
  const reveal = 20 + actionCount * 34; // same per-button math tx-row.js's fixed 88px (n=2) already implies
  return `
    <div class="manage-row-wrap${wrapClass ? " " + wrapClass : ""}" data-id="${id}" data-reveal="${reveal}">
      <div class="${contentClass || "manage-row-content manage-row"}">${contentHtml}</div>
      <div class="manage-row-actions-group">
        <div class="row-actions">${actionsHtml}</div>
      </div>
    </div>`;
}

let openRow = null;
function closeRow(rowEl) {
  rowEl.querySelector(".manage-row-actions-group").style.width = "0px";
  rowEl.dataset.open = "0";
  if (openRow === rowEl) openRow = null;
}
function openRowTo(rowEl) {
  if (openRow && openRow !== rowEl) closeRow(openRow);
  const reveal = parseFloat(rowEl.dataset.reveal || "0");
  rowEl.querySelector(".manage-row-actions-group").style.width = reveal + "px";
  rowEl.dataset.open = "1";
  openRow = rowEl;
}

// Wires every .manage-row-wrap inside containerEl. The drag surface is the
// whole row (docs/specs/settings-manage-swipe-and-sheet.md decision 5) --
// EXCEPT a pointerdown that originates inside .manage-row-actions-group,
// which is deliberately excluded so a tap on a revealed action button
// behaves as a plain click with no swipe/tap-to-close interference, and
// no risk of the row's own close animation racing that button's handler.
export function wireManageRowSwipe(containerEl) {
  containerEl.querySelectorAll(".manage-row-wrap").forEach((rowEl) => {
    rowEl.querySelector(".manage-row-actions-group").style.width = "0px";
    let dragging = false, startX = 0, startOffset = 0, moved = false;
    const group = rowEl.querySelector(".manage-row-actions-group");
    const reveal = parseFloat(rowEl.dataset.reveal || "0");

    rowEl.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".manage-row-actions-group")) return;
      dragging = true; moved = false;
      startX = e.clientX;
      startOffset = rowEl.dataset.open === "1" ? reveal : 0;
      group.classList.add("dragging");
      rowEl.setPointerCapture(e.pointerId);
    });
    rowEl.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const delta = startX - e.clientX; // dragging left grows the reveal
      if (Math.abs(delta) > 4) moved = true;
      const raw = startOffset + delta;
      let clamped;
      if (raw < 0) clamped = -Math.sqrt(-raw) * 2;
      else if (raw > reveal) clamped = reveal + Math.sqrt(raw - reveal) * 2;
      else clamped = raw;
      group.style.width = clamped + "px";
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      group.classList.remove("dragging");
      const delta = startX - (e.clientX || 0);
      const finalOffset = startOffset + delta;
      if (!moved && rowEl.dataset.open === "1") { closeRow(rowEl); return; }
      if (finalOffset > reveal / 2) openRowTo(rowEl); else closeRow(rowEl);
    }
    rowEl.addEventListener("pointerup", endDrag);
    rowEl.addEventListener("pointercancel", endDrag);

    // Desktop mouse fallback is unreachable in practice (this module is
    // only ever wired below 1024px, and this app has no touch+mouse mixed
    // device precedent handled differently elsewhere) but mirrors
    // tx-row.js's own hover fallback for parity, in case a mouse is used
    // in a narrow/resized desktop browser window.
    rowEl.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse" || dragging) return;
      openRowTo(rowEl);
    });
    rowEl.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "mouse" || dragging) return;
      closeRow(rowEl);
    });
  });
}
