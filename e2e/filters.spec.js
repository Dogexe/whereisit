import { test, expect } from "./fixtures.js";
import { addTransaction, navBtn } from "./helpers.js";

test("transactions filter sheet opens, closes, and narrows the list", async ({ page }) => {
  await page.goto("/");
  const incomeNote = "e2e income row " + Date.now();
  const expenseNote = "e2e expense row " + Date.now();

  await addTransaction(page, { type: "income", note: incomeNote, amount: "500" });
  await addTransaction(page, { type: "expense", note: expenseNote, amount: "20" });

  await expect(page.locator("#txListContainer")).toContainText(incomeNote);
  await expect(page.locator("#txListContainer")).toContainText(expenseNote);

  await page.locator("#openTxFiltersBtn").click();
  await expect(page.locator("#txFilterSheetBackdrop")).toBeVisible();

  // Radio is visually hidden in favor of its wrapping .tab-opt label (same
  // as the Add form's type toggle -- see helpers.js's addTransaction()).
  await page.locator('label.tab-opt:has(input[name="tx-type-filter"][value="income"])').click();
  await expect(page.locator("#txListContainer")).toContainText(incomeNote);
  await expect(page.locator("#txListContainer")).not.toContainText(expenseNote);

  // Real Escape keypress, not a direct state/DOM shortcut -- exercises the
  // sheet's actual keydown handler (src/screens/transactions.js).
  await page.keyboard.press("Escape");
  await expect(page.locator("#txFilterSheetBackdrop")).toBeHidden();
});

test("insights filter sheet opens, closes, and narrows the breakdown", async ({ page }) => {
  await page.goto("/");
  const noteA = "e2e cat A " + Date.now();
  const noteB = "e2e cat B " + Date.now();

  const catA = await addTransaction(page, { note: noteA, amount: "40", categoryIndex: 0 });
  await addTransaction(page, { note: noteB, amount: "60", categoryIndex: 1 });

  await navBtn(page, "insights").click();
  await page.locator('label.tab-opt:has(input[name="insights-tab"][value="breakdown"])').click();
  await expect(page.locator("#breakdownContent .breakdown-row")).toHaveCount(2);

  await page.locator("#openInsightsFiltersBtn").click();
  await expect(page.locator("#insightsFilterSheetBackdrop")).toBeVisible();

  await page.locator(`[data-insights-filter-cat="${catA}"]`).check();
  await expect(page.locator("#breakdownContent .breakdown-row")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(page.locator("#insightsFilterSheetBackdrop")).toBeHidden();
});
