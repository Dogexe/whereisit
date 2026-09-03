import { test, expect } from "./fixtures.js";
import { navBtn, createAccount, fmtMoney } from "./helpers.js";

// Regression coverage for "Fix Transfer tab silently failing to save or
// edit" (#txCategory stayed required while hidden and optionless on the
// Transfer tab -- native constraint validation blocked the submit event
// before add.js's own handler ever ran, with zero console output).
test("transfer round trip moves money between accounts, survives editing, and stays visible under the destination account's filter", async ({ page }) => {
  await page.goto("/");
  const acctBName = "e2e xfer acct " + Date.now();
  await createAccount(page, { name: acctBName, openingBalance: 1000 });

  // resetForm() (src/screens/add.js, run on every Add-tab nav) defaults the
  // Transfer tab's From to the first active account and To to the next one
  // -- with exactly two accounts (the seeded default "เงินสด" and the one
  // just created) that's already From=เงินสด/To=acctB, so no chip clicks
  // are needed to pick a direction.
  await navBtn(page, "add").click();
  await expect(page.locator("#addForm")).toBeVisible();
  await page.locator('label.tab-opt:has(input[name="form-type"][value="transfer"])').click();
  const note = "e2e transfer " + Date.now();
  await page.locator("#txAmount").fill("300");
  await page.locator("#txNote").fill(note);
  await page.locator('#addForm button[type="submit"]').click();

  // If the required+hidden bug ever regresses, the native submit event
  // never reaches this file's handler at all, so this row would simply
  // never appear -- no toast, no console error, just a dead Save button.
  const row = page.locator("#txListContainer .tx-row-wrap", { hasText: note });
  await expect(row).toBeVisible();

  await navBtn(page, "home").click();
  await expect(page.locator(".hero-card .amount")).toHaveText(fmtMoney(1000));
  const switcher = page.locator(".account-switcher-row");
  await switcher.locator("[data-account]", { hasText: "เงินสด" }).click();
  await expect(page.locator(".hero-card .amount")).toHaveText(fmtMoney(-300));
  await switcher.locator("[data-account]", { hasText: acctBName }).click();
  await expect(page.locator(".hero-card .amount")).toHaveText(fmtMoney(1300));

  // Regression guard for derived.js's deliberate toAccountId fallback: a
  // transfer's own .accountId is its *source*, so filtering Transactions by
  // the *destination* account must still surface it.
  await navBtn(page, "transactions").click();
  await page.locator("#openTxFiltersBtn").click();
  await expect(page.locator("#txFilterSheetBackdrop")).toBeVisible();
  await page.locator(".filter-checkbox-row", { hasText: acctBName }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#txFilterSheetBackdrop")).toBeHidden();
  const filteredRow = page.locator("#txListContainer .tx-row-wrap", { hasText: note });
  await expect(filteredRow).toBeVisible();

  // Edit round trip -- the same required+hidden bug also silently broke
  // re-saving an existing transfer, not just creating a new one.
  await filteredRow.hover();
  await filteredRow.locator("[data-edit]").click();
  await expect(page.locator("#addForm")).toBeVisible();
  await expect(page.locator('input[name="form-type"][value="transfer"]')).toBeChecked();
  const editedNote = "e2e transfer edited " + Date.now();
  await page.locator("#txNote").fill(editedNote);
  await page.locator('#addForm button[type="submit"]').click();

  await expect(page.locator("#txListContainer")).toContainText(editedNote);
  await expect(page.locator("#txListContainer")).not.toContainText(note);
});
