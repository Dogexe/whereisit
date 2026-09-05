import { test, expect } from "./fixtures.js";
import { navBtn } from "./helpers.js";

test("Add sheet guards paint containment, focus trapping, and drag dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, { height: 844, offsetTop: 0 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    window.__resizeVisualViewport = (height, offsetTop) => {
      viewport.height = height;
      viewport.offsetTop = offsetTop;
      viewport.dispatchEvent(new Event("resize"));
    };
  });
  await page.goto("/");
  await navBtn(page, "add").click();

  const backdrop = page.locator("#addSheetBackdrop");
  const sheet = backdrop.locator(".filter-sheet");

  await expect(backdrop).toBeVisible();
  await expect(sheet).toHaveCSS("contain", "paint");

  // Playwright cannot summon a real virtual keyboard or observe compositor
  // paint frames, so this suite cannot detect the reported ghosting itself.
  // This mocked resize only guards the declaration and the surrounding real
  // syncSheetToViewport() behavior while the sheet has a shortened scrollport.
  await page.locator("#txNote").focus();
  await page.evaluate(() => window.__resizeVisualViewport(420, 24));
  await expect(backdrop).toHaveCSS("height", "420px");
  await expect(backdrop).toHaveCSS("top", "24px");
  await expect(sheet).toHaveCSS("max-height", "336px");

  // Literal Tab is required here: setting focus directly would skip the
  // focus trap's keydown path. #txNote is the form's final focusable control,
  // so Tab must wrap to the header's Cancel button.
  await page.locator("#txNote").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#addSheetCancel")).toBeFocused();

  // Exercise wireSheetDrag() through its pointer-event sequence and confirm
  // the scoped containment declaration does not prevent dismissal.
  await page.evaluate(() => window.__resizeVisualViewport(844, 0));
  await sheet.evaluate((element) => { element.scrollTop = 0; });
  const dragTransform = await sheet.locator(".sheet-grabber").evaluate((grabber) => {
    // Synthetic PointerEvents do not own a browser pointer id, so make the
    // capture call a no-op while exercising wireSheetDrag's event path.
    grabber.setPointerCapture = () => {};
    grabber.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientY: 100 }));
    grabber.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientY: 300 }));
    grabber.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientY: 300 }));
    delete grabber.setPointerCapture;
    return grabber.closest(".filter-sheet").style.transform;
  });
  expect(dragTransform).toContain("translateY(200px)");
  await expect(backdrop).toBeHidden();
});
