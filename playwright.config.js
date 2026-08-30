import { defineConfig, devices } from "@playwright/test";

// E2E smoke tests run against the real static dist/ build (npm run
// build), served by scripts/serve.mjs -- a tiny Node static server, not
// python -m http.server, so CI doesn't need a second language runtime just
// to serve files. No Supabase backend or Google sign-in is exercised by
// any test: the app already runs fully offline signed-out (localStorage is
// the source of truth, see CLAUDE.md's Sync architecture notes), so these
// tests stay deterministic and don't depend on network availability or
// real credentials.
// Fixed rather than env-driven: passing a custom `env` to Playwright's
// webServer replaces the child process's environment on Windows instead of
// merging with it (stripping PATH/SYSTEMROOT etc., so `node` itself fails
// to spawn) -- simplest fix is to not need an env override here at all.
// scripts/serve.mjs defaults to the same port when PORT is unset.
const PORT = 8793;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // "list" for console output; "html" so a failure in CI has a report
  // bundle worth uploading as an artifact (.github/workflows/e2e.yml) --
  // never auto-opens, since that only makes sense interactively.
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node scripts/serve.mjs",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  projects: [
    {
      // A single desktop-sized project covers the sidebar shell (>=1024px)
      // that most specs exercise; the one test that specifically needs the
      // mobile bottom-nav shell (e2e/nav.spec.js) switches viewport for
      // itself with page.setViewportSize() rather than doubling the whole
      // suite across a second project -- nothing else in this suite cares
      // about viewport width, so running it twice would just be slower for
      // no extra coverage.
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } }
    }
  ]
});
