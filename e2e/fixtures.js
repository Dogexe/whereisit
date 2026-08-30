import { test as base, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const SUPABASE_JS_STUB = fileURLToPath(new URL("./fixtures/supabase-js-2.112.4.min.js", import.meta.url));

// Every spec in this suite disables the service worker before the app's own
// script runs. Production behavior when a new SW build takes control of an
// already-open tab is to reload it once (see main.js's controllerchange
// listener, and sw.js's skipWaiting()+clients.claim()) -- correct for a
// real returning visitor, but on a brand-new Playwright browser context
// (this origin's very first-ever load) the SW installs and claims clients
// almost immediately, so that reload can fire in the middle of a test and
// yank the DOM out from under whatever action is in flight. None of these
// tests are about PWA/offline behavior, so removing serviceWorker entirely
// keeps the suite deterministic instead of racing against it.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      // Deleting from the instance isn't enough -- serviceWorker is an
      // inherited accessor on Navigator.prototype, so `"serviceWorker" in
      // navigator` stays true (and main.js's `if ("serviceWorker" in
      // navigator)` guard still passes, then throws on the now-undefined
      // value) unless the property is removed from the prototype itself.
      delete window.Navigator.prototype.serviceWorker;
    });
    // Served from a local fixture (e2e/fixtures/supabase-js-2.112.4.min.js,
    // a verbatim copy of the exact version index.html pins, confirmed by
    // its sha384 matching index.html's own integrity attribute) rather than
    // fetched live: this suite is meant to run fully offline/signed-out
    // with no dependency on a real third-party CDN (a jsDelivr blip or a
    // network-restricted CI runner shouldn't be able to fail these tests).
    // Two things confirmed empirically, not assumed, before landing on
    // this approach: (1) route.abort() here logs its own browser-level
    // "Failed to load resource: net::ERR_FAILED" console entry, which
    // would wrongly trip home.spec.js's zero-console-errors assertion; (2)
    // fulfilling with a stubbed/empty body fails index.html's <script
    // integrity="sha384-..."> check (the browser enforces SRI against
    // whatever bytes it receives, regardless of interception), which logs
    // its own console error and blocks the script. Serving the exact
    // pinned bytes from disk satisfies SRI for real and loads cleanly, so
    // window.supabase ends up defined exactly as in production -- this
    // suite never signs in, so sync.js's calls all stay no-ops regardless.
    await page.route("https://cdn.jsdelivr.net/**", (route) => route.fulfill({ path: SUPABASE_JS_STUB }));
    await use(page);
  }
});
export { expect };
