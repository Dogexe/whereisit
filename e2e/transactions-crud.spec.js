import { test, expect } from "./fixtures.js";
import { addTransaction, navBtn } from "./helpers.js";

test("adding a transaction appears in both Home's recent list and Transactions' list", async ({ page }) => {
  await page.goto("/");
  const note = "e2e add flow " + Date.now();

  await addTransaction(page, { note, amount: "123.45" });

  // Saving from the desktop full-page Add screen navigates to Transactions
  // (src/screens/add.js's renderAdd() onSaved) -- so this list should
  // already reflect it without any extra navigation.
  await expect(page.locator("#txListContainer")).toContainText(note);

  await navBtn(page, "home").click();
  // Scoped to .home-col-main: Home also has an "upcoming bills" .list-card
  // in .home-col-side (from the seeded sample bills), so a bare .list-card
  // locator is ambiguous between the two.
  await expect(page.locator(".home-col-main .list-card")).toContainText(note);
});

test("editing a transaction updates the list", async ({ page }) => {
  await page.goto("/");
  const original = "e2e edit target " + Date.now();
  const edited = "e2e edited note " + Date.now();

  await addTransaction(page, { note: original, amount: "111" });
  const row = page.locator("#txListContainer .tx-row-wrap", { hasText: original });
  await expect(row).toBeVisible();

  // Real hover (not a direct click on a hidden/clipped button) -- the
  // Edit/Delete buttons are only hit-testable once .tx-trail-group's width
  // has actually expanded on pointerenter, see src/screens/tx-row.js.
  await row.hover();
  await row.locator("[data-edit]").click();

  await expect(page.locator("#addForm")).toBeVisible();
  await expect(page.locator("#txNote")).toHaveValue(original);
  await page.locator("#txNote").fill(edited);
  await page.locator("#txAmount").fill("222");
  await page.locator('#addForm button[type="submit"]').click();

  await expect(page.locator("#txListContainer")).toContainText(edited);
  await expect(page.locator("#txListContainer")).not.toContainText(original);
});

test("deleting a transaction removes it, and the undo toast restores it", async ({ page }) => {
  await page.goto("/");
  const note = "e2e delete target " + Date.now();

  await addTransaction(page, { note, amount: "55" });
  const row = page.locator("#txListContainer .tx-row-wrap", { hasText: note });
  await expect(row).toBeVisible();

  await row.hover();
  await row.locator("[data-delete]").click();

  await expect(page.locator("#txListContainer")).not.toContainText(note);
  await expect(page.locator("#toastUndoBtn")).toBeVisible();

  await page.locator("#toastUndoBtn").click();
  await expect(page.locator("#txListContainer")).toContainText(note);
});

test("mobile whole-row full swipe grows Delete, commits past 65% of the row, and Undo restores", async ({ page }) => {
  await page.goto("/");
  const note = "e2e full swipe target " + Date.now();

  await addTransaction(page, { note, amount: "55" });
  await page.setViewportSize({ width: 390, height: 844 });
  // Re-render after the breakpoint change so wireTxRowActions measures the
  // mobile amount width rather than the desktop table cell's width.
  await page.reload();
  await navBtn(page, "transactions").click();
  const row = page.locator("#txListContainer .tx-row-wrap", { hasText: note });
  await expect(row).toBeVisible();

  const dragRowLeft = async (distance, release = true) => {
    const box = await row.locator(".tx-lead").boundingBox();
    if (!box) throw new Error("transaction row content is not visible");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    // page.mouse.move() fires the row's mouse-only hover reveal before the
    // drag starts, so it is not a faithful mobile gesture. Dispatch touch
    // PointerEvents instead: tx-row.js consumes its client coordinates and
    // intentionally ignores these events in the desktop hover fallback.
    await row.locator(".tx-lead").evaluate((lead, { x, y, distance, release }) => {
      const fire = (type, clientX) => lead.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch",
        clientX, clientY: y
      }));
      fire("pointerdown", x);
      fire("pointermove", x - distance);
      if (release) fire("pointerup", x - distance);
    }, { x, y, distance, release });
    return { x, y, distance };
  };
  const releaseRowDrag = async ({ x, y, distance }) => {
    await row.locator(".tx-lead").evaluate((lead, gesture) => {
      lead.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch",
        clientX: gesture.x - gesture.distance, clientY: gesture.y
      }));
    }, { x, y, distance });
  };
  const cancelRowDrag = async () => {
    await row.locator(".tx-lead").evaluate((lead) => {
      lead.dispatchEvent(new PointerEvent("pointercancel", {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch"
      }));
    });
  };

  // Revision 8: each circle scales only through the reveal window for its
  // own slot. Revision 12 tightened the resting right-side inset to 0
  // (flush, matching the amount's own edge spacing), shrinking REVEAL from
  // 108 to 96 and its windows accordingly. At 42px, Delete (0-40px) is
  // full-size while Edit (44-84px) remains at zero scale behind the still-
  // covered portion of the row.
  const partialDrag = await dragRowLeft(42, false);
  const partialScales = await row.locator(".tx-row-actions").evaluate((actions) =>
    [...actions.querySelectorAll(".tx-swipe-action")].map((button) => {
      const values = getComputedStyle(button).transform.match(/^matrix\(([^,]+)/);
      return values ? Number(values[1]) : 1;
    })
  );
  expect(partialScales[0]).toBe(0);
  expect(partialScales[1]).toBe(1);
  await releaseRowDrag(partialDrag);
  await expect(row.locator(".tx-swipe-edit")).toHaveCSS("transform", "matrix(0, 0, 0, 0, 0, 0)");

  // Once the row has reached Edit's own reveal window, it grows separately
  // while Delete remains fully settled.
  await dragRowLeft(60, false);
  const staggeredScales = await row.locator(".tx-row-actions").evaluate((actions) =>
    [...actions.querySelectorAll(".tx-swipe-action")].map((button) => {
      const values = getComputedStyle(button).transform.match(/^matrix\(([^,]+)/);
      return values ? Number(values[1]) : 1;
    })
  );
  expect(staggeredScales[0]).toBe(0.4);
  expect(staggeredScales[1]).toBe(1);
  await cancelRowDrag();
  await expect(row.locator(".tx-swipe-edit")).toHaveCSS("transform", "matrix(0, 0, 0, 0, 0, 0)");

  // A drag on the category/icon side of the row, not the amount, opens it.
  await dragRowLeft(115);
  await expect(row.locator(".tx-row-inner")).toHaveCSS("transform", "matrix(1, 0, 0, 1, -96, 0)");
  const openGeometry = await row.evaluate((el) => {
    const edit = el.querySelector("[data-edit]");
    const del = el.querySelector("[data-delete]");
    return {
      rowHeight: el.getBoundingClientRect().height,
      edit: edit.getBoundingClientRect().toJSON(),
      delete: del.getBoundingClientRect().toJSON(),
      editRadius: getComputedStyle(edit).borderRadius,
      deleteRadius: getComputedStyle(del).borderRadius,
      editScale: getComputedStyle(edit).transform,
      deleteScale: getComputedStyle(del).transform,
      gap: getComputedStyle(el.querySelector(".tx-row-actions")).gap,
      innerTransform: getComputedStyle(el.querySelector(".tx-row-inner")).transform,
      actionsAreSibling: el.querySelector(".tx-row-actions").parentElement === el
    };
  });
  expect(openGeometry.edit.width).toBe(40);
  expect(openGeometry.delete.width).toBe(40);
  expect(openGeometry.edit.height).toBe(40);
  expect(openGeometry.delete.height).toBe(40);
  expect(openGeometry.editRadius).toBe("20px");
  expect(openGeometry.deleteRadius).toBe("20px");
  expect(openGeometry.editScale).toBe("matrix(1, 0, 0, 1, 0, 0)");
  expect(openGeometry.deleteScale).toBe("matrix(1, 0, 0, 1, 0, 0)");
  expect(openGeometry.gap).toBe("4px");
  expect(openGeometry.innerTransform).toBe("matrix(1, 0, 0, 1, -96, 0)");
  expect(openGeometry.actionsAreSibling).toBe(true);

  // This is the critical Revision 6 regression guard: Delete is clicked
  // after a real touch drag, proving the translated content box does not
  // leave dead hit-testing space that swallows the revealed action.
  await row.locator("[data-delete]").click();
  await expect(page.locator("#txListContainer")).not.toContainText(note);
  await expect(page.locator("#toastUndoBtn")).toBeVisible();
  await page.locator("#toastUndoBtn").click();
  await expect(row).toBeVisible();
  await dragRowLeft(115);

  // A press beginning on a revealed action remains a plain button action;
  // it must not activate the whole-row swipe listener.
  await row.locator("[data-edit]").evaluate((button) => {
    button.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, pointerId: 2, pointerType: "touch"
    }));
  });
  await expect(row.locator(".tx-trail-group")).not.toHaveClass(/dragging/);

  // A sub-commit full swipe hides Edit and grows Delete, then settles open.
  const expandedDrag = await dragRowLeft(40, false);
  await expect(row.locator(".tx-row-actions")).toHaveClass(/full-swipe/);
  await expect(row.locator("[data-edit]")).toHaveCSS("opacity", "0");
  const expandedDelete = await row.locator("[data-delete]").evaluate((el) => el.getBoundingClientRect().toJSON());
  expect(expandedDelete.width).toBeGreaterThan(40);
  expect(expandedDelete.height).toBeGreaterThan(40);
  await releaseRowDrag(expandedDrag);
  await expect(row.locator(".tx-row-actions")).not.toHaveClass(/full-swipe/);
  await expect(row).toHaveAttribute("data-open", "1");

  // A touch tap on the open row closes it; the next swipe starts at zero,
  // allowing its distance to be compared directly to the row's own width.
  await dragRowLeft(0);
  await expect(row).toHaveAttribute("data-open", "0");
  const rowBox = await row.boundingBox();
  if (!rowBox) throw new Error("transaction row is not visible");
  // Revision 11: at the commit boundary, Delete keeps its 8px margin while
  // the translated content layer clears the row's true leading edge.
  await dragRowLeft(rowBox.width * 0.65, false);
  const fullBarGeometry = await row.evaluate((el) => {
    const rowRect = el.getBoundingClientRect();
    const innerRect = el.querySelector(".tx-row-inner").getBoundingClientRect();
    const deleteRect = el.querySelector("[data-delete]").getBoundingClientRect();
    return {
      leftMargin: deleteRect.left - rowRect.left,
      rightMargin: rowRect.right - deleteRect.right,
      topMargin: deleteRect.top - rowRect.top,
      bottomMargin: rowRect.bottom - deleteRect.bottom,
      boundaryGap: deleteRect.left - innerRect.right,
      innerRightClearance: innerRect.right - rowRect.left
    };
  });
  expect(fullBarGeometry.leftMargin).toBeCloseTo(8, 1);
  expect(fullBarGeometry.rightMargin).toBeCloseTo(8, 1);
  expect(fullBarGeometry.topMargin).toBeCloseTo(8, 1);
  expect(fullBarGeometry.bottomMargin).toBeCloseTo(8, 1);
  expect(fullBarGeometry.boundaryGap).toBeCloseTo(8, 1);
  expect(fullBarGeometry.innerRightClearance).toBeCloseTo(0, 1);
  await cancelRowDrag();
  await dragRowLeft(rowBox.width * 0.7);

  await expect(page.locator("#txListContainer")).not.toContainText(note);
  await expect(page.locator("#toastUndoBtn")).toBeVisible();
  await page.locator("#toastUndoBtn").click();
  await expect(page.locator("#txListContainer")).toContainText(note);
});
