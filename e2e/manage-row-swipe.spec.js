import { test, expect } from "./fixtures.js";
import { navBtn } from "./helpers.js";

async function openManageSection(page, section) {
  await page.locator(`[data-settings-subpage-link="${section}"]`).click();
}

async function dragRowLeft(row, distance, release = true, startFraction = 0.5) {
  const content = row.locator(".manage-row-content, .goal-card-top-content").first();
  const box = await content.boundingBox();
  if (!box) throw new Error("Manage row content is not visible");
  const x = box.x + box.width * startFraction;
  const y = box.y + box.height / 2;
  await content.evaluate((el, gesture) => {
    const fire = (type, clientX) => el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch",
      clientX, clientY: gesture.y
    }));
    fire("pointerdown", gesture.x);
    fire("pointermove", gesture.x - gesture.distance);
    if (gesture.release) fire("pointerup", gesture.x - gesture.distance);
  }, { x, y, distance, release });
  return { content, x, y, distance };
}

async function releaseRowDrag(gesture) {
  await gesture.content.evaluate((el, current) => {
    el.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch",
      clientX: current.x - current.distance, clientY: current.y
    }));
  }, { x: gesture.x, y: gesture.y, distance: gesture.distance });
}

test("mobile Manage swipe uses WI-004 circles, opens after a sub-commit full swipe, and deletes with Undo", async ({ page }) => {
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await navBtn(page, "settings").click();
  await openManageSection(page, "budgets");

  const row = page.locator(".manage-row-wrap", { has: page.locator("[data-delete-budget]") }).first();
  await expect(row).toBeVisible();
  const partialDrag = await dragRowLeft(row, 48, false);
  const partialLayout = await row.evaluate((el) => {
    const content = el.querySelector(".manage-row-content");
    const actions = el.querySelector(".manage-row-actions-group");
    return {
      rowWidth: el.getBoundingClientRect().width,
      contentWidth: content.getBoundingClientRect().width,
      contentTransform: getComputedStyle(content).transform,
      actionsWidth: getComputedStyle(actions).width
    };
  });
  expect(partialLayout.contentWidth).toBeCloseTo(partialLayout.rowWidth, 1);
  expect(partialLayout.contentTransform).toBe("matrix(1, 0, 0, 1, -48, 0)");
  expect(partialLayout.actionsWidth).toBe("96px");
  await releaseRowDrag(partialDrag);
  await dragRowLeft(row, 116);
  await expect(row).toHaveAttribute("data-open", "1");
  const geometry = await row.locator(".manage-swipe-action").evaluateAll((buttons) => buttons.map((button) => ({
    width: button.getBoundingClientRect().width,
    height: button.getBoundingClientRect().height,
    radius: getComputedStyle(button).borderRadius,
    transform: getComputedStyle(button).transform
  })));
  expect(geometry).toEqual([
    { width: 40, height: 40, radius: "20px", transform: "matrix(1, 0, 0, 1, 0, 0)" },
    { width: 40, height: 40, radius: "20px", transform: "matrix(1, 0, 0, 1, 0, 0)" }
  ]);
  await dragRowLeft(row, 0);
  await expect(row).toHaveAttribute("data-open", "0");

  const rowBox = await row.boundingBox();
  if (!rowBox) throw new Error("Manage row is not visible");
  await dragRowLeft(row, rowBox.width * 0.7);
  await expect(page.locator("#toastUndoBtn")).toBeVisible();
  await page.locator("#toastUndoBtn").click();
  await expect(row).toBeVisible();
});

test("mobile Accounts reveals three WI-004-style actions at a 140px reveal width", async ({ page }) => {
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await navBtn(page, "settings").click();
  await openManageSection(page, "accounts");

  const row = page.locator(".manage-row-wrap", { has: page.locator("[data-delete-account]") }).first();
  await expect(row).toBeVisible();
  const fullSwipe = await dragRowLeft(row, 160, false);
  await expect(row.locator(".manage-row-actions-group")).toHaveClass(/full-swipe/);
  const fullSwipeActions = await row.locator(".manage-swipe-action").evaluateAll((buttons) => buttons.map((button) => ({
    delete: button.classList.contains("manage-swipe-delete"),
    opacity: getComputedStyle(button).opacity,
    pointerEvents: getComputedStyle(button).pointerEvents
  })));
  expect(fullSwipeActions.filter((action) => !action.delete)).toEqual([
    { delete: false, opacity: "0", pointerEvents: "none" },
    { delete: false, opacity: "0", pointerEvents: "none" }
  ]);
  await releaseRowDrag(fullSwipe);
  await expect(row).toHaveAttribute("data-open", "1");
  await expect(row.locator(".manage-row-actions-group")).toHaveCSS("width", "140px");
  await expect(row.locator(".manage-swipe-action")).toHaveCount(3);
  await expect(row.locator(".manage-swipe-action").first()).toHaveCSS("border-radius", "20px");
  await expect(row.locator(".manage-swipe-action").last()).toHaveCSS("background-color", "rgb(239, 75, 58)");
  await dragRowLeft(row, 0);
  await expect(row).toHaveAttribute("data-open", "0");

  const rowBox = await row.boundingBox();
  if (!rowBox) throw new Error("Account row is not visible");
  // Start near the row's right edge and drag only 65% of its own width --
  // well within a 390px viewport, unlike a synthetic multi-screen drag.
  await dragRowLeft(row, rowBox.width * 0.65, false, 0.9);
  const fullDeleteGeometry = await row.evaluate((el) => {
    const rowRect = el.getBoundingClientRect();
    const deleteRect = el.querySelector(".manage-swipe-delete").getBoundingClientRect();
    return { rowWidth: rowRect.width, deleteWidth: deleteRect.width };
  });
  expect(fullDeleteGeometry.deleteWidth).toBeGreaterThanOrEqual(fullDeleteGeometry.rowWidth - 20);
});
