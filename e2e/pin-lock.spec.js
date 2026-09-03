import { test, expect } from "./fixtures.js";
import { navBtn } from "./helpers.js";

// docs/specs/app-lock.md: the gate only ever applies at boot
// (applock-ui.js's renderAppLockGate(), called once from main.js's boot,
// before the first renderScreen()) -- so exercising it for real means
// setting a PIN, then reloading the page, not just checking in-memory
// state right after Settings' save.
test("enabling a PIN gates the app on reload; wrong PIN is rejected, correct PIN unlocks, and Forgot PIN clears it for good", async ({ page }) => {
  await page.goto("/");
  await navBtn(page, "settings").click();
  await page.locator('.settings-nav-item[data-settings-section="security"]').click();
  await expect(page.locator("#pinRequireSwitch")).toBeVisible();

  await page.locator("#pinRequireSwitch").click();
  await expect(page.locator("#pinSetupInput")).toBeVisible();
  await page.locator("#pinSetupInput").fill("1234");
  await page.locator("#pinConfirmInput").fill("1234");
  await page.locator("#savePinBtn").click();
  await expect(page.locator("#pinRequireSwitch")).toHaveClass(/on/);

  // Cold load: renderScreen() itself is deferred until unlock, so nothing
  // from the normal app shell (e.g. the Home hero card) exists yet.
  await page.reload();
  await expect(page.locator("#appLockBackdrop")).toBeVisible();
  await expect(page.locator(".hero-card")).toBeHidden();

  // Wrong PIN: shakes the panel and toasts, but never unlocks.
  await page.locator("#appLockPinInput").fill("0000");
  await expect(page.locator("#toast")).toBeVisible();
  await expect(page.locator("#appLockBackdrop")).toBeVisible();

  // Correct PIN unlocks -- the container is cleared entirely, not just
  // hidden (applock-ui.js's doUnlock()).
  await page.locator("#appLockPinInput").fill("1234");
  await expect(page.locator("#appLockBackdrop")).toBeHidden();
  await expect(page.locator(".hero-card")).toBeVisible();

  // Re-locks on the next cold load (PIN is still enabled) -- then "Forgot
  // PIN?" clears it immediately (no re-entry) and unlocks in the same step.
  await page.reload();
  await expect(page.locator("#appLockBackdrop")).toBeVisible();
  await page.locator("#appLockForgotBtn").click();
  await expect(page.locator("#appLockBackdrop")).toBeHidden();

  // A third cold load proves the PIN was actually cleared (persisted via
  // saveSettings()), not just dismissed for this one session.
  await page.reload();
  await expect(page.locator("#appLockBackdrop")).toBeHidden();
  await expect(page.locator(".hero-card")).toBeVisible();
});
