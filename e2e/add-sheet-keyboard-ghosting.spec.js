import { test, expect } from "./fixtures.js";
import { navBtn } from "./helpers.js";

async function openMobileApp(page) {
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
}

async function expectInnerScrollAndDragDismissal(page, backdropSelector, { expectInitiallyScrollable = true } = {}) {
  const backdrop = page.locator(backdropSelector);
  const sheet = backdrop.locator(".filter-sheet");
  const header = sheet.locator(":scope > .filter-sheet-header");
  const body = sheet.locator(":scope > .sheet-body");

  await expect(backdrop).toBeVisible();
  await expect(header).toHaveCount(1);
  await expect(body).toHaveCount(1);
  await expect(body.locator(".filter-sheet-header")).toHaveCount(0);
  await expect(sheet).toHaveCSS("overflow-y", "visible");
  await expect(header).toHaveCSS("position", "relative");
  await expect(body).toHaveCSS("overflow-y", "auto");
  await expect(body).toHaveCSS("min-height", "0px");
  await sheet.evaluate((element) => {
    element.getAnimations().forEach((animation) => animation.finish());
  });
  const initialLayout = await body.evaluate((element) => {
    const sheet = element.parentElement;
    const header = sheet.querySelector(":scope > .filter-sheet-header");
    const visibleChildren = [...element.children].filter((child) => child.getClientRects().length > 0);
    const first = visibleChildren[0];
    const last = visibleChildren.at(-1);
    const sheetRect = sheet.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const bodyRect = element.getBoundingClientRect();
    const firstRect = first.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();
    const sheetStyle = getComputedStyle(sheet);
    const bodyStyle = getComputedStyle(element);
    return {
      bodyPaddingTop: bodyStyle.paddingTop,
      bodyPaddingRight: bodyStyle.paddingRight,
      bodyPaddingBottom: bodyStyle.paddingBottom,
      bodyPaddingLeft: bodyStyle.paddingLeft,
      bodyTopFromHeaderBottom: bodyRect.top - headerRect.bottom,
      bodyTopFromSheetTop: bodyRect.top - sheetRect.top,
      bodyBottomFromSheetBottom: bodyRect.bottom - sheetRect.bottom,
      firstTopFromHeaderBottom: firstRect.top - headerRect.bottom,
      firstLeftFromSheetLeft: firstRect.left - sheetRect.left,
      headerLeftFromSheetLeft: headerRect.left - sheetRect.left,
      headerRightFromSheetRight: sheetRect.right - headerRect.right,
      lastBottomFromSheetBottom: sheetRect.bottom - lastRect.bottom,
      sheetPaddingBottom: sheetStyle.paddingBottom,
      initiallyScrollable: element.scrollHeight > element.clientHeight
    };
  });
  expect(initialLayout.bodyPaddingTop).toBe("16px");
  expect(initialLayout.bodyPaddingRight).toBe("20px");
  expect(initialLayout.bodyPaddingLeft).toBe("20px");
  expect(initialLayout.bodyPaddingBottom).toBe(initialLayout.sheetPaddingBottom);
  expect(initialLayout.bodyTopFromHeaderBottom).toBeCloseTo(0, 1);
  expect(initialLayout.bodyTopFromSheetTop).toBeGreaterThanOrEqual(20);
  expect(initialLayout.bodyBottomFromSheetBottom).toBeCloseTo(0, 1);
  expect(initialLayout.firstTopFromHeaderBottom).toBeCloseTo(16, 1);
  expect(initialLayout.firstLeftFromSheetLeft).toBeCloseTo(20, 1);
  expect(initialLayout.headerLeftFromSheetLeft).toBeCloseTo(20, 1);
  expect(initialLayout.headerRightFromSheetRight).toBeCloseTo(20, 1);
  if (!expectInitiallyScrollable) {
    expect(initialLayout.initiallyScrollable).toBe(false);
    expect(initialLayout.lastBottomFromSheetBottom).toBeCloseTo(parseFloat(initialLayout.sheetPaddingBottom), 1);
  }
  expect(await sheet.evaluate((element) => ({
    containsFocus: element.contains(document.activeElement),
    bodyOverflow: document.body.style.overflow,
    htmlOverflow: document.documentElement.style.overflow
  }))).toEqual({ containsFocus: true, bodyOverflow: "hidden", htmlOverflow: "hidden" });

  // Keep the viewport-sized box and the scrolling box distinct: the mocked
  // keyboard resize writes max-height to the outer sheet, never the body.
  await page.evaluate(() => window.__resizeVisualViewport(200, 24));
  await expect(backdrop).toHaveCSS("height", "200px");
  await expect(backdrop).toHaveCSS("top", "24px");
  await expect(sheet).toHaveCSS("max-height", "160px");
  expect(await body.evaluate((element) => element.style.maxHeight)).toBe("");

  // Force a real overflow on even the short Import/Export bodies. Scrolling
  // the body must leave its sibling header stationary.
  const headerTop = await header.evaluate((element) => element.getBoundingClientRect().top);
  const scrollMetrics = await body.evaluate((element) => {
    element.scrollTop = Math.min(40, element.scrollHeight - element.clientHeight);
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop
    };
  });
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
  expect(scrollMetrics.scrollTop).toBeGreaterThan(0);
  expect(await header.evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(headerTop, 1);

  const endClearance = await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    const last = [...element.children].filter((child) => child.getClientRects().length > 0).at(-1);
    const bodyRect = element.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();
    return {
      actual: bodyRect.bottom - lastRect.bottom,
      expected: parseFloat(getComputedStyle(element).paddingBottom),
      remainingScroll: element.scrollHeight - element.clientHeight - element.scrollTop
    };
  });
  expect(endClearance.remainingScroll).toBeLessThanOrEqual(1);
  expect(endClearance.actual).toBeGreaterThanOrEqual(endClearance.expected - 1);

  // Exercise wireSheetDrag() through the grabber on the outer sheet while
  // the independent body scrollport is scrolled.
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
  await expect.poll(() => page.evaluate(() => ({
    bodyOverflow: document.body.style.overflow,
    htmlOverflow: document.documentElement.style.overflow
  }))).toEqual({ bodyOverflow: "", htmlOverflow: "" });
}

test("Add sheet separates viewport sizing, body scrolling, focus trapping, and drag dismissal", async ({ page }) => {
  await openMobileApp(page);
  await navBtn(page, "add").click();

  const sheet = page.locator("#addSheetBackdrop .filter-sheet");
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderTopLeftRadius: style.borderTopLeftRadius,
      borderTopRightRadius: style.borderTopRightRadius,
      gap: style.gap,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom
    };
  })).toEqual({
    borderTopLeftRadius: "20px",
    borderTopRightRadius: "20px",
    gap: "16px",
    paddingTop: "8px",
    paddingRight: "20px",
    paddingBottom: "20px"
  });

  const noteInput = page.locator("#txNote");
  await noteInput.focus();
  const focusRingGeometry = await noteInput.locator("xpath=parent::*").evaluate((inputWrap) => {
    const scrollport = inputWrap.closest(".sheet-body");
    const wrapStyle = getComputedStyle(inputWrap);
    const bodyStyle = getComputedStyle(scrollport);
    const wrapRect = inputWrap.getBoundingClientRect();
    const bodyRect = scrollport.getBoundingClientRect();
    const outlineBleed = parseFloat(wrapStyle.outlineWidth) + parseFloat(wrapStyle.outlineOffset);
    return {
      paddingLeft: bodyStyle.paddingLeft,
      paddingRight: bodyStyle.paddingRight,
      outlineWidth: wrapStyle.outlineWidth,
      outlineOffset: wrapStyle.outlineOffset,
      outline: {
        top: wrapRect.top - outlineBleed,
        right: wrapRect.right + outlineBleed,
        bottom: wrapRect.bottom + outlineBleed,
        left: wrapRect.left - outlineBleed
      },
      clip: {
        top: bodyRect.top + parseFloat(bodyStyle.borderTopWidth),
        right: bodyRect.right - parseFloat(bodyStyle.borderRightWidth),
        bottom: bodyRect.bottom - parseFloat(bodyStyle.borderBottomWidth),
        left: bodyRect.left + parseFloat(bodyStyle.borderLeftWidth)
      }
    };
  });
  expect(focusRingGeometry.paddingLeft).toBe("20px");
  expect(focusRingGeometry.paddingRight).toBe("20px");
  expect(focusRingGeometry.outlineWidth).toBe("2px");
  expect(focusRingGeometry.outlineOffset).toBe("1px");
  expect(focusRingGeometry.outline.left).toBeGreaterThanOrEqual(focusRingGeometry.clip.left);
  expect(focusRingGeometry.outline.right).toBeLessThanOrEqual(focusRingGeometry.clip.right);
  expect(focusRingGeometry.outline.top).toBeGreaterThanOrEqual(focusRingGeometry.clip.top);
  expect(focusRingGeometry.outline.bottom).toBeLessThanOrEqual(focusRingGeometry.clip.bottom);

  // Literal Tab is required here: setting focus directly would skip the
  // focus trap's keydown path. #txNote is the form's final focusable control,
  // so Tab must wrap to the header's Cancel button across the new wrapper.
  await page.locator("#txNote").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#addSheetCancel")).toBeFocused();

  await expectInnerScrollAndDragDismissal(page, "#addSheetBackdrop");
});

test("Transactions sheet scrolls its body and dismisses from the outer sheet", async ({ page }) => {
  await openMobileApp(page);
  await navBtn(page, "transactions").click();
  await page.locator("#openTxFiltersBtn").click();
  await expectInnerScrollAndDragDismissal(page, "#txFilterSheetBackdrop");
});

test("Insights sheet scrolls its body and dismisses from the outer sheet", async ({ page }) => {
  await openMobileApp(page);
  await navBtn(page, "insights").click();
  await page.locator('label.tab-opt:has(input[name="insights-tab"][value="breakdown"])').click();
  await page.locator("#openInsightsFiltersBtn").click();
  await expectInnerScrollAndDragDismissal(page, "#insightsFilterSheetBackdrop");
});

test("Settings Manage sheet scrolls its body and dismisses from the outer sheet", async ({ page }) => {
  await openMobileApp(page);
  await navBtn(page, "settings").click();
  const group = page.locator('.settings-group[data-group="accounts"]');
  await group.locator("summary .label").click();
  await expect(group).toHaveJSProperty("open", true);
  await group.locator("#addAccountBtn").click();
  await expectInnerScrollAndDragDismissal(page, "#manageSheetBackdrop");
});

test("Export sheet scrolls its body and dismisses from the outer sheet", async ({ page }) => {
  await openMobileApp(page);
  await navBtn(page, "settings").click();
  await page.locator("#openExportSheetBtn").click();
  await expectInnerScrollAndDragDismissal(page, "#exportSheetBackdrop", { expectInitiallyScrollable: false });
});

test("Import sheet scrolls its body and dismisses from the outer sheet", async ({ page }) => {
  await openMobileApp(page);
  await navBtn(page, "settings").click();
  await page.locator("#openImportSheetBtn").click();
  await expectInnerScrollAndDragDismissal(page, "#importSheetBackdrop", { expectInitiallyScrollable: false });
});
