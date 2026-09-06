import { test, expect } from "./fixtures.js";
import { navBtn, createAccount, fmtMoney, openSettingsSection } from "./helpers.js";

test("creating an account and switching Home's account scope narrows the hero balance and recent activity", async ({ page }) => {
  await page.goto("/");
  const acctName = "e2e switch acct " + Date.now();
  await createAccount(page, { name: acctName, openingBalance: 500 });

  await navBtn(page, "add").click();
  await expect(page.locator("#addForm")).toBeVisible();
  // A fresh account has zero transactions, so it isn't defaultAccountId()'s
  // pick yet (derived.js falls back to the first active account, "เงินสด")
  // -- select it explicitly via its chip.
  await page.locator("#accountChipRow [data-account-chip]", { hasText: acctName }).click();
  await page.locator("#categoryChipRow [data-chip]").first().click();
  const note = "e2e scoped tx " + Date.now();
  await page.locator("#txAmount").fill("150");
  await page.locator("#txNote").fill(note);
  await page.locator('#addForm button[type="submit"]').click();

  await navBtn(page, "home").click();
  const switcher = page.locator(".account-switcher-row");
  await switcher.locator("[data-account]", { hasText: acctName }).click();
  await expect(page.locator(".hero-card .amount")).toHaveText(fmtMoney(350)); // 500 opening - 150 expense
  await expect(page.locator(".home-col-main .list-card")).toContainText(note);

  await switcher.locator("[data-account]", { hasText: "เงินสด" }).click();
  await expect(page.locator(".hero-card .amount")).toHaveText(fmtMoney(0));
  await expect(page.locator(".home-col-main .list-card")).not.toContainText(note);
});

// Regression coverage for the mobile Manage sheet's icon picker, which only
// exists below the 1024px
// desktop-shell breakpoint, where Settings' Manage forms open in
// #manageSheetContainer instead of expanding inline.
test("mobile Manage sheet: the Add button opens the form and its icon picker responds to clicks", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await navBtn(page, "settings").click();

  await openSettingsSection(page, "accounts");
  await expect(page.locator('[data-settings-section-content="accounts"]')).toBeVisible();
  await page.locator("#addAccountBtn").click();
  await expect(page.locator("#manageSheetBackdrop")).toBeVisible();

  const acctName = "e2e mobile acct " + Date.now();
  await page.locator("#accountNameInput").fill(acctName);
  await page.locator("#accountOpeningBalanceInput").fill("50");

  // Regression guard: the mobile sheet's own copy of the icon-picker
  // markup used to have no click wiring at all (renderManageSheet()
  // populates a fresh form that renderSettings()'s desktop-pass wiring
  // never reaches), so no icon button visually responded to a click.
  const secondIcon = page.locator("#manageSheetContainer .icon-picker-option").nth(1);
  await secondIcon.click();
  await expect(secondIcon).toHaveClass(/selected/);

  await page.locator("#saveAccountFormBtn").click();
  await expect(page.locator("#manageSheetBackdrop")).toBeHidden();
  await expect(page.locator(".manage-row", { hasText: acctName })).toBeVisible();
});
