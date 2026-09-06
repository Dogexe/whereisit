import { test, expect } from "./fixtures.js";

async function expectKeyboardOutline(page, focusTarget, outlineTarget = focusTarget) {
  await page.keyboard.press("Tab");
  await expect(focusTarget).toBeFocused();
  expect(await outlineTarget.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineWidth: style.outlineWidth, outlineOffset: style.outlineOffset };
  })).toEqual({ outlineWidth: "2px", outlineOffset: "2px" });
}

test("keyboard-reachable controls paint the canonical focus outline", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    document.body.insertAdjacentHTML("beforeend", `
      <button id="focusStart" type="button">start</button>
      <button class="nav-btn" id="navFocus" type="button">nav</button>
      ${Array.from({ length: 6 }, (_, index) => `<label class="tab-opt"><input type="radio" name="focus-group-${index}" ${index === 0 ? "checked" : ""}>tab</label>`).join("")}
      <button class="switch" id="switchFocus" type="button"></button>
      <button class="toggle-row" id="toggleFocus" type="button">toggle</button>
      <button class="home-profile-btn" id="profileFocus" type="button">profile</button>
      <button class="toast-undo-btn" id="toastFocus" type="button">undo</button>
      <button class="shortcut-btn" id="shortcutFocus" type="button">shortcut</button>
      <div class="period-pill"><button id="periodFocus" type="button">period</button></div>
      <div class="picker-year-row"><button class="step" id="yearStepFocus" type="button">year step</button></div>
      <button class="picker-year-heading" id="yearHeadingFocus" type="button">year</button>
      <button class="picker-month-cell" id="monthFocus" type="button">month</button>
      <div class="filter-field-label"><button id="filterLabelFocus" type="button">clear</button></div>
      <div class="kind-toggle"><button id="kindFocus" type="button">kind</button></div>
      <label class="filter-checkbox-row"><input id="checkboxFocus" type="checkbox">checkbox</label>
    `);
  });

  await page.locator("#focusStart").click();
  await expectKeyboardOutline(page, page.locator("#navFocus"));
  for (let index = 0; index < 6; index++) {
    const input = page.locator(`input[name="focus-group-${index}"]`);
    await expectKeyboardOutline(page, input, input.locator("xpath=parent::*"));
  }
  for (const id of ["switchFocus", "toggleFocus", "profileFocus", "toastFocus", "shortcutFocus", "periodFocus", "yearStepFocus", "yearHeadingFocus", "monthFocus", "filterLabelFocus", "kindFocus"]) {
    await expectKeyboardOutline(page, page.locator(`#${id}`));
  }

  await page.keyboard.press("Tab");
  await expect(page.locator("#checkboxFocus")).toBeFocused();
  expect(await page.locator("#checkboxFocus").evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
});
