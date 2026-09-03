import { test, expect } from "./fixtures.js";
import { navBtn, openSettingsSection, fmtMoney } from "./helpers.js";

test("a subcategory is selectable on Add and rolls its spend up into its parent's Insights breakdown slice", async ({ page }) => {
  await page.goto("/");
  await navBtn(page, "settings").click();
  await openSettingsSection(page, "categories");

  const parentName = "e2e parent cat " + Date.now();
  await page.locator("#addCategoryBtn").click();
  await expect(page.locator("#categoryNameInput")).toBeVisible();
  await page.locator("#categoryNameInput").fill(parentName);
  await page.locator("#saveCategoryFormBtn").click();
  const parentRow = page.locator(".manage-row", { hasText: parentName });
  await expect(parentRow).toBeVisible();
  const parentId = await parentRow.locator("[data-edit-category]").getAttribute("data-edit-category");

  const childName = "e2e child cat " + Date.now();
  await page.locator("#addCategoryBtn").click();
  await page.locator("#categoryNameInput").fill(childName);
  await page.locator("#categoryParentSelect").selectOption(parentId);
  await page.locator("#saveCategoryFormBtn").click();
  const childRow = page.locator(".manage-row", { hasText: childName });
  await expect(childRow).toBeVisible();
  await expect(childRow).toHaveClass(/manage-row-child/);
  const childId = await childRow.locator("[data-edit-category]").getAttribute("data-edit-category");

  // Selectable on Add: a brand-new category has zero usage, so it never
  // shows up in the chip row's top-5 -- has to come from the "more"
  // overflow into the real <select> (docs/specs/category-nesting.md stage
  // 4 groups parent-then-child there, indented).
  await navBtn(page, "add").click();
  await expect(page.locator("#addForm")).toBeVisible();
  await page.locator("#categoryMoreChip").click();
  await page.locator("#txCategory").selectOption(childId);
  await expect(page.locator("#txCategory")).toHaveValue(childId);
  const childNote = "e2e child tx " + Date.now();
  await page.locator("#txAmount").fill("50");
  await page.locator("#txNote").fill(childNote);
  await page.locator('#addForm button[type="submit"]').click();
  await expect(page.locator("#txListContainer")).toContainText(childNote);

  // A second transaction booked directly under the parent.
  await navBtn(page, "add").click();
  await expect(page.locator("#addForm")).toBeVisible();
  await page.locator("#categoryMoreChip").click();
  await page.locator("#txCategory").selectOption(parentId);
  const parentNote = "e2e parent tx " + Date.now();
  await page.locator("#txAmount").fill("100");
  await page.locator("#txNote").fill(parentNote);
  await page.locator('#addForm button[type="submit"]').click();

  // docs/specs/category-nesting.md stage 5's own live-verify recipe: a
  // transaction under a subcategory and another under its parent both land
  // in ONE combined slice under the parent's name/total, not two rows --
  // unit-tested at the math level already (tests/derived.test.js), this is
  // the UI-wiring half (the actual category picker + breakdown render).
  await navBtn(page, "insights").click();
  await page.locator('label.tab-opt:has(input[name="insights-tab"][value="breakdown"])').click();
  const parentSlice = page.locator("#breakdownContent .breakdown-row", { hasText: parentName });
  await expect(parentSlice).toBeVisible();
  await expect(parentSlice).toContainText(fmtMoney(150));
  await expect(page.locator("#breakdownContent .breakdown-row", { hasText: childName })).toHaveCount(0);
});
