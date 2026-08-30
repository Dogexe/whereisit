import { test, expect } from "./fixtures.js";

test("app loads to the Home screen with no console errors", async ({ page }) => {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto("/");

  await expect(page.locator("h2.screen-title")).toBeVisible();
  await expect(page.locator(".hero-card .amount")).toBeVisible();
  await expect(page.locator('.nav-btn[data-tab="home"]:visible')).toHaveClass(/active/);

  expect(errors).toEqual([]);
});
