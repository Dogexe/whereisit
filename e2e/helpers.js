import { expect } from "@playwright/test";

// Shared by every spec that needs at least one transaction on the page --
// goes through the real Add form (the same form backs both the desktop
// full-page screen and the mobile bottom sheet, see src/screens/add.js), not
// a localStorage/state shortcut, so these tests exercise the same code path
// a real user's "Add" tap does. `:visible` picks whichever of the sidebar's
// or tab bar's Add button is actually rendered at the current viewport
// (styles.css's 1024px breakpoint keeps the other one at display:none) --
// both share the .nav-btn[data-tab="add"] selector, so without this a
// strict-mode Playwright locator would match two elements and throw.
//
// Returns the category's id (#txCategory's value, i.e. categoryId) so
// callers that need to filter by a specific category afterward
// (e.g. Insights' Filters sheet) don't have to re-derive it.
export async function addTransaction(page, { type = "expense", note, amount, categoryIndex = 0 } = {}) {
  await page.locator('.nav-btn[data-tab="add"]:visible').click();
  await expect(page.locator("#addForm")).toBeVisible();
  // The radio itself is visually hidden (opacity:0, pointer-events:none --
  // styles.css's .tab-opt input) in favor of its wrapping label rendering
  // as a pill button, so a real user (and this click) targets the label.
  if (type === "income") await page.locator('label.tab-opt:has(input[name="form-type"][value="income"])').click();
  // Category selection happens via the visible chip row, not the
  // underlying <select> -- src/screens/add.js's renderCategoryChips() hides
  // #txCategory (.category-select-collapsed) whenever the selected
  // category is one of the visible top-used chips, which is the state a
  // fresh form always starts in, so driving the hidden <select> directly
  // isn't an interaction a real user could perform.
  await page.locator("#categoryChipRow [data-chip]").nth(categoryIndex).click();
  const categoryId = await page.locator("#txCategory").inputValue();
  await page.locator("#txAmount").fill(String(amount));
  if (note) await page.locator("#txNote").fill(note);
  await page.locator('#addForm button[type="submit"]').click();
  return categoryId;
}

// Same "whichever shell is visible" reasoning as addTransaction() above.
export function navBtn(page, tab) {
  return page.locator(`.nav-btn[data-tab="${tab}"]:visible`);
}
