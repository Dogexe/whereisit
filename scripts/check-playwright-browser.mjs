import { chromium } from "@playwright/test";

try {
  const browser = await chromium.launch();
  await browser.close();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const expectedPath = /Executable doesn't exist at ([^\r\n]+)/.exec(message)?.[1] ?? chromium.executablePath();

  console.error("Playwright Chromium preflight failed: no tests were run.");
  if (expectedPath) console.error(`Expected browser path: ${expectedPath}`);
  console.error("Install it with: npx playwright install chromium");
  console.error(message);
  process.exitCode = 1;
}
