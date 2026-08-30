import { test, expect } from "./fixtures.js";

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
    ["settings", "#darkSwitch"]
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
    ["settings", "#darkSwitch"],
    ["home", ".hero-card"]
  ];
  for (const [tab, marker] of checks) {
    await sidebar.locator(`[data-tab="${tab}"]`).click();
    await expect(sidebar.locator(`[data-tab="${tab}"]`)).toHaveClass(/active/);
    await expect(page.locator(marker)).toBeVisible();
  }
});
