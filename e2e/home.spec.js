import { test, expect } from "./fixtures.js";
import { createBill, navBtn, openSettingsSection } from "./helpers.js";

async function dragHero(page, distance) {
  const card = page.locator(".hero-card");
  const box = await card.boundingBox();
  if (!box) throw new Error("Hero card is not visible");
  await card.evaluate((element, gesture) => {
    const fire = (type, clientX) => element.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch",
      clientX, clientY: gesture.y
    }));
    fire("pointerdown", gesture.x);
    fire("pointermove", gesture.x + gesture.distance);
    fire("pointerup", gesture.x + gesture.distance);
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2, distance });
}

test("app loads to the Home screen with no console errors", async ({ page }) => {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto("/");

  await expect(page.locator("h2.screen-title")).toBeVisible();
  await expect(page.locator(".hero-page:not([aria-hidden]) .amount")).toBeVisible();
  await expect(page.locator('.nav-btn[data-tab="home"]:visible')).toHaveClass(/active/);

  expect(errors).toEqual([]);
});

test("fresh profile shows the Home and Insights budget empty states", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".home-col-side .empty-note")).toBeVisible();
  await expect(page.locator(".home-col-side .budgets-list .budget-item")).toHaveCount(0);
  await expect(page.locator("[data-mark-paid]")).toHaveCount(0);

  await navBtn(page, "insights").click();
  await expect(page.locator("#budgetsContent .empty-note")).toBeVisible();
  const alignment = await page.locator("#budgetsContent").evaluate((panel) => {
    const note = panel.querySelector(":scope > .empty-note");
    if (!note) throw new Error("budget empty note must be a direct panel child");
    const panelRect = panel.getBoundingClientRect();
    const noteRect = note.getBoundingClientRect();
    return { panelCenter: panelRect.left + panelRect.width / 2, noteCenter: noteRect.left + noteRect.width / 2 };
  });
  expect(Math.abs(alignment.noteCenter - alignment.panelCenter)).toBeLessThanOrEqual(2);
  await expect(page.locator("#budgetsContent .insight-card")).toHaveCount(0);
  await expect(page.locator("#addBudgetFromInsightsBtn")).toHaveCount(0);
});

test("marking a bill paid can be undone with the bill restored and transaction removed", async ({ page }) => {
  await page.goto("/");
  const billName = "e2e undo paid bill " + Date.now();
  await createBill(page, { name: billName, amount: 321, day: new Date().getDate() });

  await navBtn(page, "home").click();
  const billRow = page.locator(".home-col-side .manage-row", { hasText: billName });
  await expect(billRow).toBeVisible();
  const dueLabel = await billRow.locator(".sub").innerText();

  await billRow.locator("[data-mark-paid]").click();
  await expect(billRow).toHaveCount(0);
  await expect(page.locator(".home-col-main .tx-row-wrap", { hasText: billName })).toBeVisible();
  await expect(page.locator("#toastUndoBtn")).toBeVisible();

  await page.locator("#toastUndoBtn").click();
  await expect(billRow).toBeVisible();
  await expect(billRow.locator(".sub")).toHaveText(dueLabel);
  await expect(page.locator(".home-col-main .tx-row-wrap", { hasText: billName })).toHaveCount(0);

  await navBtn(page, "transactions").click();
  await expect(page.locator("#txListContainer")).not.toContainText(billName);
});

test("Home hero carousel supports arrows, dots, swipe thresholds, fade, localization, and reduced motion", async ({ page }) => {
  await page.goto("/");

  const card = page.locator(".hero-card");
  const dots = page.locator(".hero-dots");
  const indicator = dots.locator(".hero-dot-indicator");
  const previous = page.locator(".hero-arrow-prev");
  const next = page.locator(".hero-arrow-next");
  await expect(page.locator(".account-switcher-row")).toHaveCount(0);
  await expect(dots.locator(".hero-dot")).toHaveCount(2);
  await expect(dots.locator(".hero-dot").first()).toHaveCSS("width", "18px");
  expect(await dots.locator(".hero-dot").first().evaluate((element) => {
    const dot = getComputedStyle(element, "::before");
    return {
      width: dot.width,
      height: dot.height,
      borderStyle: dot.borderStyle,
      backgroundColor: dot.backgroundColor,
    };
  })).toEqual({
    width: "8px",
    height: "8px",
    borderStyle: "none",
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  });
  await expect(indicator).toHaveCount(1);
  await expect(indicator).toHaveCSS("width", "8px");
  await expect(indicator).toHaveCSS("height", "8px");
  await expect(indicator).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -4)");
  await expect(dots).toHaveCSS("opacity", "0");
  await expect(previous).toBeVisible();
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();

  await next.click();
  await expect(card.locator(".hero-page:not([aria-hidden]) .kicker")).toHaveText("เงินสด");
  await expect(indicator).toHaveCSS("transform", "matrix(1, 0, 0, 1, 18, -4)");
  await expect(previous).toBeEnabled();
  await expect(next).toBeDisabled();
  await expect(dots).toHaveCSS("opacity", "1");
  await page.waitForTimeout(1750);
  await expect(dots).toHaveCSS("opacity", "0");

  await page.reload();
  await expect(card.locator(".hero-page:not([aria-hidden]) .kicker")).toHaveText("ยอดคงเหลือรวม");
  await dots.getByRole("button", { name: "เงินสด" }).click();
  await expect(card.locator(".hero-page:not([aria-hidden]) .kicker")).toHaveText("เงินสด");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(previous).toBeHidden();
  await expect(next).toBeHidden();
  const width = (await card.boundingBox()).width;
  const restingIndicatorTransform = await indicator.evaluate((element) => getComputedStyle(element).transform);
  await card.dispatchEvent("pointerdown", { pointerId: 3, pointerType: "touch", clientX: width * 0.8, clientY: 100 });
  await card.dispatchEvent("pointermove", { pointerId: 3, pointerType: "touch", clientX: width * 0.4, clientY: 100 });
  expect(await indicator.evaluate((element) => getComputedStyle(element).transform)).toBe(restingIndicatorTransform);
  await card.dispatchEvent("pointercancel", { pointerId: 3, pointerType: "touch", clientX: width * 0.4, clientY: 100 });
  await dragHero(page, -width * 0.4);
  await expect(card).toHaveAttribute("data-hero-index", "0");
  await dragHero(page, -width * 0.6);
  await expect(card).toHaveAttribute("data-hero-index", "1");
  await dragHero(page, -width * 0.7);
  await expect(card).toHaveAttribute("data-hero-index", "1");
  await dragHero(page, width * 0.6);
  await expect(card).toHaveAttribute("data-hero-index", "0");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await card.dispatchEvent("pointerdown", { pointerId: 2, pointerType: "touch", clientX: 100, clientY: 100 });
  await card.dispatchEvent("pointerup", { pointerId: 2, pointerType: "touch", clientX: 100, clientY: 100 });
  await expect(dots).toHaveCSS("transition-duration", "0s");
  await expect(indicator).toHaveCSS("transition-duration", "0s");
  await expect(dots).toHaveCSS("opacity", "1");
  await page.waitForTimeout(1550);
  await expect(dots).toHaveCSS("opacity", "0");

  await page.setViewportSize({ width: 1280, height: 900 });
  await navBtn(page, "settings").click();
  await openSettingsSection(page, "display");
  await page.locator('.settings-disclosure-trigger[aria-controls="languageOptions"]').click();
  await page.locator('label.tab-opt:has(input[name="lang-switch"][value="en"])').click();
  await page.locator('.settings-disclosure-trigger[aria-controls="appearanceOptions"]').click();
  await page.locator('label.tab-opt:has(input[name="appearance-switch"][value="dark"])').click();
  await navBtn(page, "home").click();
  await expect(card.locator(".hero-page:not([aria-hidden]) .kicker")).toHaveText("Total balance");
  await expect(card).toBeVisible();
});
