import { test, expect } from "./fixtures.js";
import { navBtn, openSettingsSection } from "./helpers.js";

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
