import { test, expect } from "./fixtures.js";
import { addTransaction, navBtn } from "./helpers.js";

test("adding a transaction appears in both Home's recent list and Transactions' list", async ({ page }) => {
  await page.goto("/");
  const note = "e2e add flow " + Date.now();

  await addTransaction(page, { note, amount: "123.45" });

  // Saving from the desktop full-page Add screen navigates to Transactions
  // (src/screens/add.js's renderAdd() onSaved) -- so this list should
  // already reflect it without any extra navigation.
  await expect(page.locator("#txListContainer")).toContainText(note);

  await navBtn(page, "home").click();
  // Scoped to .home-col-main: Home also has an "upcoming bills" .list-card
  // in .home-col-side (from the seeded sample bills), so a bare .list-card
  // locator is ambiguous between the two.
  await expect(page.locator(".home-col-main .list-card")).toContainText(note);
});

test("editing a transaction updates the list", async ({ page }) => {
  await page.goto("/");
  const original = "e2e edit target " + Date.now();
  const edited = "e2e edited note " + Date.now();

  await addTransaction(page, { note: original, amount: "111" });
  const row = page.locator("#txListContainer .tx-row-wrap", { hasText: original });
  await expect(row).toBeVisible();

  // Real hover (not a direct click on a hidden/clipped button) -- the
  // Edit/Delete buttons are only hit-testable once .tx-trail-group's width
  // has actually expanded on pointerenter, see src/screens/tx-row.js.
  await row.hover();
  await row.locator("[data-edit]").click();

  await expect(page.locator("#addForm")).toBeVisible();
  await expect(page.locator("#txNote")).toHaveValue(original);
  await page.locator("#txNote").fill(edited);
  await page.locator("#txAmount").fill("222");
  await page.locator('#addForm button[type="submit"]').click();

  await expect(page.locator("#txListContainer")).toContainText(edited);
  await expect(page.locator("#txListContainer")).not.toContainText(original);
});

test("deleting a transaction removes it, and the undo toast restores it", async ({ page }) => {
  await page.goto("/");
  const note = "e2e delete target " + Date.now();

  await addTransaction(page, { note, amount: "55" });
  const row = page.locator("#txListContainer .tx-row-wrap", { hasText: note });
  await expect(row).toBeVisible();

  await row.hover();
  await row.locator("[data-delete]").click();

  await expect(page.locator("#txListContainer")).not.toContainText(note);
  await expect(page.locator("#toastUndoBtn")).toBeVisible();

  await page.locator("#toastUndoBtn").click();
  await expect(page.locator("#txListContainer")).toContainText(note);
});
