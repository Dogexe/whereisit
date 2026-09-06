// docs/specs/settings-manage-swipe-and-sheet.md: mobile-only (<1024px)
// swipe-to-reveal for Settings' Manage rows (Budgets/Bills/Categories/
// Accounts/Goals). A sibling implementation to tx-row.js's swipe, not a
// shared import -- the drag surface and button count genuinely differ
// (see the spec's own "why a new module" decision). Like tx-row.js, the
// actions are an absolutely positioned layer beneath an opaque content
// layer, while the content translates left as the reveal grows. This keeps
// the row's layout rigid: no text squeezes, truncates, or reflows mid-drag.
// contentClass defaults to "manage-row" (every list-row caller); Goals'
// card-shaped context (docs/specs/settings-manage-swipe-and-sheet.md
// stage covering it) passes "goal-card-top-content" instead, since a
// goal card is its own self-contained box -- it doesn't want .manage-row's
// divider/padding baked in, only the icon+info+badge's own flex layout.
export function manageSwipeWrapHtml(id, contentHtml, actionsHtml, actionCount, contentClass, wrapClass) {
  // 12px leading padding + 40px per action + 4px between actions. The
  // rightmost circle sits flush with the row edge, matching tx-row.js.
  const reveal = 12 + actionCount * 40 + (actionCount - 1) * 4;
  return `
    <div class="manage-row-wrap${wrapClass ? " " + wrapClass : ""}" data-id="${id}" data-reveal="${reveal}">
      <div class="${contentClass || "manage-row-content manage-row"}">${contentHtml}</div>
      <div class="manage-row-actions-group">
        <div class="row-actions">${actionsHtml}</div>
      </div>
    </div>`;
}

let openRow = null;
const DELETE_COMMIT_RATIO = 0.65;

function setRevealOffset(rowEl, offset) {
  const group = rowEl.querySelector(".manage-row-actions-group");
  const content = rowEl.querySelector(".manage-row-content, .goal-card-top-content");
  const reveal = parseFloat(rowEl.dataset.reveal || "0");
  const swipeButtons = group.querySelectorAll(".manage-swipe-action");
  const deleteButton = group.querySelector(".manage-swipe-delete");
  const fullSwipe = offset > reveal;

  // Each circle starts growing only once its own slot is uncovered from the
  // right edge, exactly as tx-row.js does for transaction actions.
  swipeButtons.forEach((button) => {
    const revealStart = parseFloat(button.dataset.revealStart || "0");
    const revealEnd = parseFloat(button.dataset.revealEnd || String(reveal));
    const localProgress = Math.max(0, Math.min(1, (offset - revealStart) / (revealEnd - revealStart)));
    button.style.transform = `scale(${localProgress})`;
  });
  group.classList.toggle("full-swipe", fullSwipe);
  if (!fullSwipe || !deleteButton) {
    group.style.width = reveal + "px";
    if (content) content.style.transform = `translateX(${-offset}px)`;
    deleteButton?.style.removeProperty("width");
    deleteButton?.style.removeProperty("height");
    deleteButton?.style.removeProperty("right");
    deleteButton?.style.removeProperty("top");
    return;
  }

  group.style.removeProperty("width");
  const commitThreshold = parseFloat(rowEl.dataset.deleteCommitThreshold || "0");
  const rowRect = rowEl.getBoundingClientRect();
  const inset = parseFloat(getComputedStyle(rowEl).getPropertyValue("--space-xs")) || 8;
  const progress = Math.min(1, (offset - reveal) / (commitThreshold - reveal));
  const width = 40 + (rowRect.width - inset * 2 - 40) * progress;
  const height = 40 + (rowRect.height - inset * 2 - 40) * progress;
  const revealOffset = Math.max(reveal, width + inset * progress + inset);
  if (content) content.style.transform = `translateX(${-revealOffset}px)`;
  deleteButton.style.width = width + "px";
  deleteButton.style.height = height + "px";
  deleteButton.style.right = inset * progress + "px";
  deleteButton.style.top = ((rowRect.height - height) / 2) + "px";
}

function closeRow(rowEl) {
  setRevealOffset(rowEl, 0);
  rowEl.dataset.open = "0";
  if (openRow === rowEl) openRow = null;
}
function openRowTo(rowEl) {
  if (openRow && openRow !== rowEl) closeRow(openRow);
  const reveal = parseFloat(rowEl.dataset.reveal || "0");
  setRevealOffset(rowEl, reveal);
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
    setRevealOffset(rowEl, 0);
    let dragging = false, startX = 0, startOffset = 0, moved = false;
    const group = rowEl.querySelector(".manage-row-actions-group");
    const reveal = parseFloat(rowEl.dataset.reveal || "0");
    rowEl.dataset.deleteCommitThreshold = String(rowEl.getBoundingClientRect().width * DELETE_COMMIT_RATIO);
    const swipeButtons = group.querySelectorAll(".manage-swipe-action");
    // The last/rightmost action is uncovered first. The 4px gaps are not
    // part of either circle's grow window, matching tx-row.js's per-button
    // reveal ranges.
    swipeButtons.forEach((button, index) => {
      const fromRight = swipeButtons.length - 1 - index;
      const revealStart = fromRight * 44;
      button.dataset.revealStart = String(revealStart);
      button.dataset.revealEnd = String(revealStart + 40);
    });

    rowEl.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".manage-row-actions-group")) return;
      dragging = true; moved = false;
      startX = e.clientX;
      startOffset = rowEl.dataset.open === "1" ? reveal : 0;
      rowEl.querySelector(".manage-row-content, .goal-card-top-content")?.classList.add("dragging");
      group.classList.add("dragging");
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
      rowEl.querySelector(".manage-row-content, .goal-card-top-content")?.classList.remove("dragging");
      group.classList.remove("dragging");
      const delta = startX - (e.clientX || 0);
      const finalOffset = startOffset + delta;
      if (finalOffset > parseFloat(rowEl.dataset.deleteCommitThreshold || "0")) {
        group.querySelector(".manage-swipe-delete")?.click();
        return;
      }
      if (!moved && rowEl.dataset.open === "1") { closeRow(rowEl); return; }
      if (finalOffset > reveal / 2) openRowTo(rowEl); else closeRow(rowEl);
    }
    rowEl.addEventListener("pointerup", endDrag);
    rowEl.addEventListener("pointercancel", () => {
      if (!dragging) return;
      dragging = false;
      rowEl.querySelector(".manage-row-content, .goal-card-top-content")?.classList.remove("dragging");
      group.classList.remove("dragging");
      if (startOffset > reveal / 2) openRowTo(rowEl); else closeRow(rowEl);
    });

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
