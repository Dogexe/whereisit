import { test, expect } from "./fixtures.js";
import { navBtn } from "./helpers.js";

function contrastRatio(rgbA, rgbB) {
  const rgb = (value) => Array.isArray(value) ? value : value.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number);
  const luminance = (values) => {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(values[0]) + 0.7152 * channel(values[1]) + 0.0722 * channel(values[2]);
  };
  const [light, dark] = [luminance(rgb(rgbA)), luminance(rgb(rgbB))].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

async function transferTypeMetrics(page) {
  const transfer = page.locator('label.type-tab-opt:has(input[value="transfer"])');
  await transfer.click();
  await expect(transfer).toHaveCSS("color", "rgb(23, 102, 92)");
  return transfer.evaluate((element) => {
    const tabs = element.parentElement;
    const typeOptions = [...tabs.querySelectorAll(".type-tab-opt")];
    const style = getComputedStyle(element);
    const renderedRgb = (color) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    return {
      background: renderedRgb(style.backgroundColor),
      color: renderedRgb(style.color),
      tabsOverflow: tabs.scrollWidth > tabs.clientWidth,
      labelsFit: typeOptions.every((option) => {
        const text = option.querySelector("span");
        return text.scrollWidth <= text.clientWidth;
      }),
      widths: typeOptions.map((option) => option.getBoundingClientRect().width),
      gaps: typeOptions.slice(1).map((option, index) => option.getBoundingClientRect().left - typeOptions[index].getBoundingClientRect().right)
    };
  });
}

test("Type selector has contrast-safe transfer tint and fits at narrow and desktop widths", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");

  // Use English so the long "Transfer" label is the narrow-width case.
  await navBtn(page, "settings").click();
  await page.locator('label.tab-opt:has(input[name="lang-switch"][value="en"])').click();
  await navBtn(page, "add").click();
  await expect(page.locator("#addSheetBackdrop")).toBeVisible();

  const light = await transferTypeMetrics(page);
  expect(contrastRatio(light.color, light.background), JSON.stringify(light)).toBeGreaterThanOrEqual(4.5);
  expect(light.tabsOverflow).toBe(false);
  expect(light.labelsFit).toBe(true);

  // Escape exercises the sheet's real keyboard close handler before opening
  // Settings to toggle the theme for the second contrast measurement.
  await page.keyboard.press("Escape");
  await expect(page.locator("#addSheetBackdrop")).toBeHidden();
  await navBtn(page, "settings").click();
  await page.locator("#darkSwitch").click();
  await navBtn(page, "add").click();
  const dark = await transferTypeMetrics(page);
  expect(contrastRatio(dark.color, dark.background), JSON.stringify(dark)).toBeGreaterThanOrEqual(4.5);
  expect(dark.tabsOverflow).toBe(false);
  expect(dark.labelsFit).toBe(true);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await navBtn(page, "add").click();
  const desktop = await transferTypeMetrics(page);
  expect(Math.max(...desktop.widths) - Math.min(...desktop.widths)).toBeLessThanOrEqual(1);
  expect(Math.max(...desktop.gaps)).toBeLessThanOrEqual(2);
});
