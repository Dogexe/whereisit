import { test, expect } from "./fixtures.js";

test("mobile bottom-nav accessible names localize without changing its rendered geometry", async ({ page }) => {
  const names = {
    th: ["หน้าแรก", "รายการ", "เพิ่ม", "ภาพรวม", "ตั้งค่า"],
    en: ["Home", "Transactions", "Add", "Insights", "Settings"]
  };
  const assertNames = async (lang) => {
    const buttons = page.locator("#tabbar button");
    await expect(buttons).toHaveCount(5);
    for (let i = 0; i < names[lang].length; i++) await expect(buttons.nth(i)).toHaveAccessibleName(names[lang][i]);
  };
  const geometry = () => page.locator("#tabbar button").evaluateAll((buttons) => buttons.map((button) => {
    const { x, y, width, height } = button.getBoundingClientRect();
    return { x, y, width, height };
  }));
  const switchLanguage = async (lang) => {
    await page.locator('[aria-controls="languageOptions"]').click();
    await page.locator(`.tab-opt:has(input[name="lang-switch"][value="${lang}"])`).click();
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await assertNames("th");
  await expect(page.locator("#tabbar button")).toHaveText(["", "", "", "", ""]);
  await expect(page.locator("#tabbar button svg[aria-hidden=\"true\"]")).toHaveCount(5);
  const narrowGeometry = await geometry();

  await page.locator('#tabbar [data-tab="settings"]').click();
  await switchLanguage("en");
  await assertNames("en");
  expect(await geometry()).toEqual(narrowGeometry);

  await page.setViewportSize({ width: 768, height: 844 });
  const wideGeometry = await geometry();
  await switchLanguage("th");
  await assertNames("th");
  expect(await geometry()).toEqual(wideGeometry);
});

test("mobile bottom-nav switches screens and updates active state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const tabbar = page.locator("#tabbar");
  await expect(tabbar).toBeVisible();
  await expect(page.locator("#sidebar")).toBeHidden();
  await expect(tabbar.locator('[data-tab="home"]')).toHaveClass(/active/);

  const checks = [
    ["transactions", "#openTxFiltersBtn"],
    ["insights", "#insightsModeTabs"],
    ["settings", '.settings-disclosure-trigger[aria-controls="appearanceOptions"]']
  ];
  for (const [tab, marker] of checks) {
    await tabbar.locator(`[data-tab="${tab}"]`).click();
    await expect(tabbar.locator(`[data-tab="${tab}"]`)).toHaveClass(/active/);
    await expect(page.locator(marker)).toBeVisible();
  }

  // Add is a bottom-sheet overlay on mobile, not a real tab --
  // state.tab (and therefore the active nav highlight) deliberately stays
  // on whatever screen was already showing. See src/screens/add.js /
  // src/main.js's nav click handler.
  await tabbar.locator('[data-tab="add"]').click();
  await expect(page.locator("#addSheetBackdrop")).toBeVisible();
  await expect(page.locator("#addForm")).toBeVisible();
  await expect(tabbar.locator('[data-tab="settings"]')).toHaveClass(/active/);
  await expect(tabbar.locator('[data-tab="add"]')).not.toHaveClass(/active/);
});

test("mobile Settings drills into a real same-URL history entry and browser Back restores the root", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator('#tabbar [data-tab="settings"]').click();

  const rootList = page.locator(".settings-mobile-manage-nav");
  const budgetsLink = page.locator('[data-settings-subpage-link="budgets"]');
  await expect(rootList).toBeVisible();
  const urlBefore = page.url();
  const historyLengthBefore = await page.evaluate(() => history.length);

  await budgetsLink.click();
  await expect(page.locator('[data-settings-section-content="budgets"]')).toBeVisible();
  await expect(page.locator(".manage-row-wrap").first()).toBeVisible();
  await expect(page.locator(".tabbar-wrap")).toBeHidden();
  await expect(page.locator("#addBudgetBtn")).toBeVisible();
  await expect(page.locator(".settings-manage-header #addBudgetBtn")).toHaveCount(0);
  await expect(rootList).toBeHidden();
  expect(page.url()).toBe(urlBefore);
  expect(await page.evaluate(() => history.length)).toBe(historyLengthBefore + 1);
  await expect(page.locator("details, summary")).toHaveCount(0);

  await page.goBack();
  await expect(rootList).toBeVisible();
  await expect(page.locator('[data-settings-section-content="budgets"]')).toBeHidden();
  await expect(page.locator("#tabbar")).toBeVisible();
  await expect(page.locator('#tabbar [data-tab="settings"]')).toHaveClass(/active/);
  expect(page.url()).toBe(urlBefore);

  await page.locator('[data-settings-subpage-link="accounts"]').click();
  await page.locator(".settings-back-btn:visible").click();
  await expect(rootList).toBeVisible();
});

test("desktop sidebar switches screens and updates active state", async ({ page }) => {
  // Default project viewport (see playwright.config.js) is already
  // desktop-sized (1280x900), well past the 1024px sidebar breakpoint.
  await page.goto("/");

  const sidebar = page.locator("#sidebar");
  await expect(sidebar).toBeVisible();
  await expect(page.locator(".tabbar-wrap")).toBeHidden();
  await expect(sidebar.locator('[data-tab="home"]')).toHaveClass(/active/);

  const checks = [
    ["transactions", "#openTxFiltersBtn"],
    ["add", "#addForm"],
    ["insights", "#insightsModeTabs"],
    ["settings", '.settings-disclosure-trigger[aria-controls="appearanceOptions"]'],
    ["home", ".hero-card"]
  ];
  for (const [tab, marker] of checks) {
    await sidebar.locator(`[data-tab="${tab}"]`).click();
    await expect(sidebar.locator(`[data-tab="${tab}"]`)).toHaveClass(/active/);
    await expect(page.locator(marker)).toBeVisible();
  }
});
