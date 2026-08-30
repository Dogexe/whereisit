import { test, expect } from "./fixtures.js";
import { navBtn } from "./helpers.js";

test("toggling dark mode in Settings actually changes the rendered theme", async ({ page }) => {
  await page.goto("/");
  await navBtn(page, "settings").click();
  await expect(page.locator("#darkSwitch")).toBeVisible();

  const bgColor = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  const lightBg = await bgColor();
  await page.locator("#darkSwitch").click();
  const darkBg = await bgColor();

  // Real computed style check (theme.js's applyTheme() sets --color-bg,
  // which body's CSS reads via var()), not just "the switch's own class
  // changed" -- #f6f6f8 light vs #141519 dark.
  expect(darkBg).not.toBe(lightBg);
  expect(lightBg).toBe("rgb(246, 246, 248)");
  expect(darkBg).toBe("rgb(20, 21, 25)");

  // Toggling back should restore the original light background exactly.
  await page.locator("#darkSwitch").click();
  expect(await bgColor()).toBe(lightBg);
});
