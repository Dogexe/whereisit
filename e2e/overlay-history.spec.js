import { test, expect } from "./fixtures.js";
import { createBill, navBtn, openSettingsSection } from "./helpers.js";

async function openBudgetSubPage(page) {
  await navBtn(page, "settings").click();
  await openSettingsSection(page, "budgets");
  await expect(page.locator('[data-settings-section-content="budgets"]')).toBeVisible();
}

async function openBudgetManageSheet(page) {
  await page.locator("#addBudgetBtn").click();
  await expect(page.locator("#manageSheetBackdrop")).toBeVisible();
  expect(await page.evaluate(() => history.state)).toEqual({ overlay: "settings-manage" });
}

async function expectBudgetSubPageEntry(page) {
  await expect(page.locator("#manageSheetBackdrop")).toBeHidden();
  await expect(page.locator('[data-settings-section-content="budgets"]')).toBeVisible();
  await expect(page.locator(".settings-mobile-manage-nav")).toBeHidden();
  await expect.poll(() => page.evaluate(() => history.state)).toEqual({ overlay: "settings-subpage" });
}

async function swipeManageSheetDown(page) {
  await page.locator("#manageSheetBackdrop .sheet-grabber").evaluate((grabber) => {
    grabber.setPointerCapture = () => {};
    grabber.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientY: 100 }));
    grabber.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientY: 300 }));
    grabber.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientY: 300 }));
  });
}

async function expectOverlayHistory(page, { open, backdrop, key, close, secondClose }) {
  await page.evaluate(() => history.replaceState({ base: true }, ""));
  const urlBefore = page.url();
  const historyLengthBefore = await page.evaluate(() => history.length);

  await open();
  await expect(page.locator(backdrop)).toBeVisible();
  expect(page.url()).toBe(urlBefore);
  expect(await page.evaluate(() => history.length)).toBe(historyLengthBefore + 1);
  expect(await page.evaluate(() => history.state)).toEqual({ overlay: key });

  await page.goBack();
  await expect(page.locator(backdrop)).toBeHidden();
  await expect(page.locator("#screen")).toBeVisible();
  expect(page.url()).toBe(urlBefore);
  expect(await page.evaluate(() => history.state)).toEqual({ base: true });

  await open();
  await close();
  await expect(page.locator(backdrop)).toBeHidden();
  await expect.poll(() => page.evaluate(() => history.state)).toEqual({ base: true });
  const historyLengthAfterDismissal = await page.evaluate(() => history.length);

  await open();
  expect(await page.evaluate(() => history.length)).toBe(historyLengthAfterDismissal);
  await close();
  await expect.poll(() => page.evaluate(() => history.state)).toEqual({ base: true });
  expect(await page.evaluate(() => history.length)).toBe(historyLengthAfterDismissal);

  if (secondClose) {
    await open();
    await secondClose();
    await expect(page.locator(backdrop)).toBeHidden();
    await expect.poll(() => page.evaluate(() => history.state)).toEqual({ base: true });
    expect(await page.evaluate(() => history.length)).toBe(historyLengthAfterDismissal);
  }
}

test("Transactions filter sheet uses a dismissible history entry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await navBtn(page, "transactions").click();
  await expectOverlayHistory(page, {
    open: () => page.locator("#openTxFiltersBtn").click(),
    backdrop: "#txFilterSheetBackdrop",
    key: "transactions-filters",
    close: () => page.locator("#txFilterSheetClose").click()
  });
});

test("Insights filter sheet uses a dismissible history entry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await navBtn(page, "insights").click();
  await page.locator('label.tab-opt:has(input[name="insights-tab"][value="breakdown"])').click();
  await expectOverlayHistory(page, {
    open: () => page.locator("#openInsightsFiltersBtn").click(),
    backdrop: "#insightsFilterSheetBackdrop",
    key: "insights-filters",
    close: () => page.locator("#insightsFilterSheetClose").click(),
    secondClose: () => page.keyboard.press("Escape")
  });
});

test("Export sheet uses a dismissible history entry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await navBtn(page, "settings").click();
  await openSettingsSection(page, "sync");

  await expectOverlayHistory(page, {
    open: () => page.locator("#openExportSheetBtn").click(),
    backdrop: "#exportSheetBackdrop",
    key: "export",
    close: () => page.locator("#exportSheetClose").click()
  });
});

test("Import sheet uses a dismissible history entry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await navBtn(page, "settings").click();
  await openSettingsSection(page, "sync");
  await expectOverlayHistory(page, {
    open: () => page.locator("#openImportSheetBtn").click(),
    backdrop: "#importSheetBackdrop",
    key: "import",
    close: () => page.locator("#importSheetClose").click()
  });
});

test("Settings sub-page and Manage sheet pop one history entry at a time", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => history.replaceState({ base: true }, ""));
  const settingsUrl = page.url();

  await openBudgetSubPage(page);
  expect(await page.evaluate(() => history.state)).toEqual({ overlay: "settings-subpage" });
  await openBudgetManageSheet(page);
  await expect(page.locator(".tabbar-wrap")).toBeHidden();

  await page.goBack();
  await expectBudgetSubPageEntry(page);

  await page.goBack();
  await expect(page.locator(".settings-mobile-manage-nav")).toBeVisible();
  await expect(page.locator('[data-settings-section-content="budgets"]')).toBeHidden();
  await expect(page.locator("#tabbar")).toBeVisible();
  expect(await page.evaluate(() => history.state)).toEqual({ base: true });
  expect(page.url()).toBe(settingsUrl);

  await page.goBack();
  expect(page.url()).not.toBe(settingsUrl);
});

test("every non-Back Manage dismissal preserves its Settings sub-page entry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => history.replaceState({ base: true }, ""));
  await openBudgetSubPage(page);

  const dismissals = [
    () => page.locator("#manageSheetClose").click(),
    () => page.locator("#manageSheetBackdrop").click({ position: { x: 4, y: 4 } }),
    () => page.keyboard.press("Escape"),
    () => swipeManageSheetDown(page),
    () => page.locator("#cancelBudgetFormBtn").click()
  ];

  for (const dismiss of dismissals) {
    await openBudgetManageSheet(page);
    await dismiss();
    await expectBudgetSubPageEntry(page);
  }

  await openBudgetManageSheet(page);
  await page.locator("#budgetLimitInput").fill("750");
  await page.locator("#saveBudgetFormBtn").click();
  await expectBudgetSubPageEntry(page);
  await expect(page.locator(".manage-row-wrap", { has: page.locator("[data-delete-budget]") })).toHaveCount(1);
});

test("switching away from a Settings sub-page releases its history entry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => history.replaceState({ base: true }, ""));
  await openBudgetSubPage(page);

  // The tab bar is intentionally hidden on a mobile sub-page, so dispatch
  // the existing nav handler directly to cover main.js's programmatic path.
  await page.locator('#tabbar [data-tab="home"]').dispatchEvent("click");
  await expect(page.locator(".hero-card")).toBeVisible();
  await expect.poll(() => page.evaluate(() => history.state)).toEqual({ base: true });

  await navBtn(page, "settings").click();
  await expect(page.locator(".settings-mobile-manage-nav")).toBeVisible();
});

test("bill notification deep link keeps stacked Back behavior after replacing history state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const billName = `History bill ${Date.now()}`;
  await createBill(page, { name: billName });
  const billId = await page.locator("[data-edit-bill]").getAttribute("data-edit-bill");

  await page.goto(`/?bill=${encodeURIComponent(billId)}`);
  await expect(page.locator("#manageSheetBackdrop")).toBeVisible();
  await expect(page.locator("#billNameInput")).toHaveValue(billName);
  expect(page.url()).not.toContain("?bill=");
  expect(await page.evaluate(() => history.state)).toBeNull();

  await page.goBack();
  await expect(page.locator("#manageSheetBackdrop")).toBeHidden();
  await expect(page.locator('[data-settings-section-content="bills"]')).toBeVisible();
  await expect(page.locator(".settings-mobile-manage-nav")).toBeHidden();

  await page.goBack();
  await expect(page.locator(".settings-mobile-manage-nav")).toBeVisible();
  await expect(page.locator('[data-settings-section-content="bills"]')).toBeHidden();
});

test("desktop Settings sections and Manage forms do not push overlay history", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => history.replaceState({ base: true }, ""));
  const historyLengthBefore = await page.evaluate(() => history.length);
  await navBtn(page, "settings").click();
  await openSettingsSection(page, "budgets");
  await page.locator("#addBudgetBtn").click();

  await expect(page.locator("#budgetLimitInput")).toBeVisible();
  await expect(page.locator("#manageSheetBackdrop")).toHaveCount(0);
  expect(await page.evaluate(() => history.state)).toEqual({ base: true });
  expect(await page.evaluate(() => history.length)).toBe(historyLengthBefore);
});

test("Exporting CSV releases the Export sheet history entry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => history.replaceState({ base: true }, ""));
  await navBtn(page, "settings").click();
  await openSettingsSection(page, "sync");

  await page.locator("#openExportSheetBtn").click();
  await expect(page.locator("#exportSheetBackdrop")).toBeVisible();
  expect(await page.evaluate(() => history.state)).toEqual({ overlay: "export" });

  const download = page.waitForEvent("download");
  await page.locator("#exportCsvBtn").click();
  await download;
  await expect(page.locator("#exportSheetBackdrop")).toBeHidden();
  await expect.poll(() => page.evaluate(() => history.state)).toEqual({ base: true });
});
