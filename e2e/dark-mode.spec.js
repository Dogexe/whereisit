import { test, expect } from "./fixtures.js";
import { navBtn } from "./helpers.js";

test("toggling dark mode in Settings actually changes the rendered theme", async ({ page }) => {
  await page.goto("/");
  await navBtn(page, "settings").click();
  const appearanceRow = page.locator('.settings-disclosure-trigger[aria-controls="appearanceOptions"]');
  await expect(appearanceRow).toBeVisible();

  const bgColor = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  const lightBg = await bgColor();
  await appearanceRow.click();
  await page.locator('label.tab-opt:has(input[name="appearance-switch"][value="dark"])').click();
  const darkBg = await bgColor();

  // Real computed style check (theme.js's applyTheme() sets --color-bg,
  // which body's CSS reads via var()), not just "the switch's own class
  // changed" -- #f6f6f8 light vs #141519 dark.
  expect(darkBg).not.toBe(lightBg);
  expect(lightBg).toBe("rgb(246, 246, 248)");
  expect(darkBg).toBe("rgb(20, 21, 25)");

  // Toggling back should restore the original light background exactly.
  await appearanceRow.click();
  await page.locator('label.tab-opt:has(input[name="appearance-switch"][value="light"])').click();
  expect(await bgColor()).toBe(lightBg);
});

test("display disclosures are keyboard-operable and update their values on mobile and desktop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await navBtn(page, "settings").click();

  const disclosures = [
    ["appearanceOptions", 'input[name="appearance-switch"][value="dark"]'],
    ["accentColorOptions", 'input[name="accent-color-switch"][value="purple"]'],
    ["languageOptions", 'input[name="lang-switch"][value="en"]']
  ];
  for (const [controlId] of disclosures) {
    const row = page.locator(`.settings-disclosure-trigger[aria-controls="${controlId}"]`);
    await expect(row).toHaveAttribute("aria-expanded", "false");
    await row.focus();
    await page.keyboard.press("Space");
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(`#${controlId}`)).toBeVisible();
    await page.keyboard.press("Space");
    await expect(row).toHaveAttribute("aria-expanded", "false");
  }

  await page.locator('.settings-disclosure-trigger[aria-controls="appearanceOptions"]').click();
  await page.locator('label.tab-opt:has(input[name="appearance-switch"][value="dark"])').click();
  await expect(page.locator('.settings-disclosure-trigger[aria-controls="appearanceOptions"]')).toContainText("มืด");

  await page.locator('.settings-disclosure-trigger[aria-controls="accentColorOptions"]').click();
  await page.locator('label.tab-opt:has(input[name="accent-color-switch"][value="purple"])').click();
  await expect(page.locator('.settings-disclosure-trigger[aria-controls="accentColorOptions"] .settings-accent-dot')).toHaveCSS("background-color", "rgb(98, 71, 234)");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim())).toBe("#6247ea");

  await page.locator('.settings-disclosure-trigger[aria-controls="languageOptions"]').click();
  await page.locator('label.tab-opt:has(input[name="lang-switch"][value="en"])').click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator('.settings-disclosure-trigger[aria-controls="languageOptions"]')).toContainText("English");

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('.settings-disclosure-trigger[aria-controls="appearanceOptions"]').click();
  await expect(page.locator("#appearanceOptions")).toBeVisible();
});
