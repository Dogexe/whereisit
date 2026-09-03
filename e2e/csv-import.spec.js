import { test, expect } from "./fixtures.js";
import { navBtn, openSettingsSection, createAccount } from "./helpers.js";

test("importing a CSV reports new/duplicate/unreadable counts and lands new rows in the chosen account", async ({ page }) => {
  await page.goto("/");
  const acctName = "e2e csv acct " + Date.now();
  await createAccount(page, { name: acctName, openingBalance: 0 });

  const dupNote = "e2e csv dup " + Date.now();
  const newNote = "e2e csv new " + Date.now();

  // Seed one existing expense directly in the target account -- dedupe is
  // scoped per-account (docs/specs/csv-import.md decision 2: buildImportPlan
  // itself has no concept of accounts, the caller filters existingTx to the
  // chosen account first), so this only exercises the CSV's own duplicate
  // row if both land in the same account.
  await navBtn(page, "add").click();
  await expect(page.locator("#addForm")).toBeVisible();
  await page.locator("#accountChipRow [data-account-chip]", { hasText: acctName }).click();
  await page.locator("#categoryChipRow [data-chip]").first().click();
  await page.locator("#txAmount").fill("20");
  await page.locator("#txNote").fill(dupNote);
  await page.locator('#addForm button[type="submit"]').click();

  // Matches src/utils.js's localDateIso() exactly (local calendar date,
  // not UTC) -- the seeded transaction above defaulted to this same date.
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const csvContent = [
    "date,amount,note",
    `2020-01-15,500,${newNote}`,
    `${todayIso},-20,${dupNote}`,
    "not-a-date,10,unreadable row"
  ].join("\n");

  await navBtn(page, "settings").click();
  await openSettingsSection(page, "sync");
  await page.locator("#openImportSheetBtn").click();
  await expect(page.locator("#importSheetBackdrop")).toBeVisible();

  // Inline file content -- no fixture file needed, since the duplicate
  // row's date has to be "today" to match the seeded transaction above.
  await page.locator("#importFileInput").setInputFiles({
    name: "e2e-import.csv", mimeType: "text/csv", buffer: Buffer.from(csvContent)
  });
  await expect(page.locator("#importColDate")).toBeVisible();
  await page.locator("#importColDate").selectOption("0");
  await page.locator("#importColAmount").selectOption("1");
  await page.locator("#importColNote").selectOption("2");
  await page.locator("#importAccountChipRow [data-account-chip]", { hasText: acctName }).click();
  await page.locator("#importContinueBtn").click();

  // {new} new · {dup} duplicates · {bad} unreadable, in that order, in
  // either language (i18n.js's importSummaryLine) -- extracting just the
  // digits keeps this assertion language-agnostic.
  const summaryText = await page.locator("#importSheetBody .empty-note").innerText();
  expect(summaryText.match(/\d+/g)).toEqual(["1", "1", "1"]);

  await page.locator("#importCommitBtn").click();
  await expect(page.locator("#importSheetBackdrop")).toBeHidden();

  await navBtn(page, "home").click();
  const switcher = page.locator(".account-switcher-row");
  await switcher.locator("[data-account]", { hasText: acctName }).click();
  await expect(page.locator(".home-col-main .list-card")).toContainText(newNote);
  await switcher.locator("[data-account]", { hasText: "เงินสด" }).click();
  await expect(page.locator(".home-col-main .list-card")).not.toContainText(newNote);
});
